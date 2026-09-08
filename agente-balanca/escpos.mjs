// Cupom da balança em ESC/POS (bytes direto pra térmica — sem PDF, sem driver).
// Sai em menos de meio segundo. Layout igual ao do PDF: logo, nome, endereço,
// "COMANDA · BALANÇA", número grande, PESO/TARA/VALOR, QR da comanda, data,
// mensagem, item e TOTAL; corte no fim.
import { PNG } from "pngjs";
import QRCode from "qrcode";

const ESC = 0x1b, GS = 0x1d;
const COLS = 48;           // fonte A em papel de 80 mm
const DOTS = 576;          // largura útil em pontos (80 mm)

// CP1252 (ESC t 16): acentos do português.
const MAPA = { "á": 0xe1, "à": 0xe0, "â": 0xe2, "ã": 0xe3, "ä": 0xe4, "é": 0xe9, "è": 0xe8, "ê": 0xea, "í": 0xed, "ì": 0xec, "î": 0xee,
  "ó": 0xf3, "ò": 0xf2, "ô": 0xf4, "õ": 0xf5, "ö": 0xf6, "ú": 0xfa, "ù": 0xf9, "û": 0xfb, "ü": 0xfc, "ç": 0xe7,
  "Á": 0xc1, "À": 0xc0, "Â": 0xc2, "Ã": 0xc3, "É": 0xc9, "Ê": 0xca, "Í": 0xcd, "Ó": 0xd3, "Ô": 0xd4, "Õ": 0xd5, "Ú": 0xda, "Ü": 0xdc, "Ç": 0xc7,
  "º": 0xba, "ª": 0xaa, "°": 0xb0, "·": 0xb7, "—": 0x2d, "–": 0x2d, "★": 0x2a, "R$": null };
function enc(txt) {
  const out = [];
  for (const ch of String(txt)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (MAPA[ch] != null) out.push(MAPA[ch]);
    else out.push(0x3f); // ?
  }
  return Buffer.from(out);
}

class Cupom {
  constructor() { this.partes = []; }
  raw(...b) { this.partes.push(Buffer.from(b)); return this; }
  init() { return this.raw(ESC, 0x40).raw(ESC, 0x74, 16); }          // reset + CP1252
  alinhar(a) { return this.raw(ESC, 0x61, a === "c" ? 1 : a === "r" ? 2 : 0); }
  negrito(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  tamanho(w = 1, h = 1) { return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1)); }
  texto(t) { this.partes.push(enc(t)); return this; }
  linha(t = "") { return this.texto(t).raw(0x0a); }
  pular(n = 1) { return this.raw(ESC, 0x64, n); }
  cortar() { return this.raw(GS, 0x56, 66, 0); }
  // esquerda + direita na mesma linha (fonte normal)
  dupla(esq, dir) {
    const d = String(dir), e = String(esq).slice(0, COLS - d.length - 1);
    return this.linha(e + " ".repeat(Math.max(1, COLS - e.length - d.length)) + d);
  }
  tracejada() { return this.linha("-".repeat(COLS)); }
  // imagem 1 bit (GS v 0): bits[y][x] true = preto; largura em múltiplos de 8
  raster(bits, largura, altura) {
    const bytesPorLinha = Math.ceil(largura / 8);
    const dados = Buffer.alloc(bytesPorLinha * altura);
    for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) if (bits[y][x]) dados[y * bytesPorLinha + (x >> 3)] |= 0x80 >> (x & 7);
    this.raw(GS, 0x76, 0x30, 0, bytesPorLinha & 0xff, bytesPorLinha >> 8, altura & 0xff, altura >> 8);
    this.partes.push(dados);
    return this;
  }
  bytes() { return Buffer.concat(this.partes); }
}

// PNG → bitmap 1 bit com largura alvo (redimensiona por amostragem; alpha = branco).
function pngParaBits(buf, larguraAlvo) {
  const png = PNG.sync.read(buf);
  const escala = larguraAlvo / png.width;
  const W = larguraAlvo, H = Math.max(1, Math.round(png.height * escala));
  const bits = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    const sy = Math.min(png.height - 1, Math.floor(y / escala));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(png.width - 1, Math.floor(x / escala));
      const i = (sy * png.width + sx) * 4;
      const a = png.data[i + 3] / 255;
      const lum = (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2]) * a + 255 * (1 - a);
      row.push(lum < 140);
    }
    bits.push(row);
  }
  return { bits, W, H };
}

// QR → bitmap (cada módulo vira um quadrado de `esc` pontos)
function qrBits(texto, esc = 5) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: "M" });
  const n = qr.modules.size, W = n * esc;
  const bits = [];
  for (let y = 0; y < W; y++) {
    const row = [];
    for (let x = 0; x < W; x++) row.push(!!qr.modules.get(Math.floor(y / esc), Math.floor(x / esc)));
    bits.push(row);
  }
  return { bits, W, H: W };
}

const kg = (n) => `${Number(n || 0).toFixed(3).replace(".", ",")} kg`;
const moeda = (n) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;

// d: { nome, endereco, telefone, msg, numero, codigoOffline, peso, tara, valor,
//      liquido, livre, viradaLivre, antes, urlComanda, logo (Buffer|null) }
export function gerarCupomEscPos(d) {
  const c = new Cupom().init();
  c.alinhar("c");
  if (d.logo) {
    try { const { bits, W, H } = pngParaBits(d.logo, 200); c.raster(bits, W, H).pular(1); } catch { /* sem logo */ }
  }
  c.negrito(true).tamanho(1, 2).linha(String(d.nome || "").toUpperCase()).tamanho(1, 1).negrito(false);
  const l2 = [d.endereco, d.telefone].filter(Boolean).join(" · ");
  if (l2) c.linha(l2);
  c.linha("COMANDA · BALANÇA").pular(1);

  const num = d.codigoOffline ? String(d.codigoOffline) : `#${d.numero}`;
  c.negrito(true).tamanho(num.length > 8 ? 2 : 3, 3).linha(num).tamanho(1, 1).negrito(false).pular(1);

  if (Number(d.peso) > 0) {
    const col = Math.floor(COLS / 3);
    const cel = (s) => { const t = String(s); const p = Math.max(0, col - t.length); return " ".repeat(Math.floor(p / 2)) + t + " ".repeat(p - Math.floor(p / 2)); };
    c.alinhar("l").linha(cel("PESO") + cel("TARA") + cel("VALOR"));
    c.negrito(true).linha(cel(kg(d.peso)) + cel(kg(d.tara)) + cel(moeda(d.valor))).negrito(false).alinhar("c");
  } else {
    c.linha("VALOR").negrito(true).tamanho(1, 2).linha(moeda(d.valor)).tamanho(1, 1).negrito(false);
  }
  if (d.livre) c.negrito(true).tamanho(1, 2).linha(d.viradaLivre ? "* AGORA É BUFFET LIVRE *" : "BUFFET LIVRE").tamanho(1, 1).negrito(false);
  if (d.viradaLivre && d.antes != null) c.linha(`era ${moeda(d.antes)} por peso`);
  c.pular(1);

  if (d.codigoOffline) {
    c.negrito(true).linha("SEM INTERNET NO MOMENTO").negrito(false)
      .linha(`Guarde este cupom — código ${d.codigoOffline}.`)
      .linha("A comanda entra no sistema automaticamente.").pular(1);
  } else if (d.urlComanda) {
    try { const { bits, W, H } = qrBits(d.urlComanda, 5); c.raster(bits, W, H).pular(1); } catch { /* sem QR */ }
  }
  c.linha(new Date().toLocaleString("pt-BR"));
  if (d.msg) c.linha(String(d.msg));
  c.alinhar("l").tracejada();
  const item = Number(d.peso) > 0 ? `Buffet (${kg(d.liquido)})` : "Buffet livre (à vontade)";
  c.dupla(item, moeda(d.valor));
  c.negrito(true).tamanho(2, 2).dupla("TOTAL", moeda(d.valor).replace(" ", "")).tamanho(1, 1).negrito(false);
  c.pular(3).cortar();
  return c.bytes();
}

// Página de teste curta (pra conferir impressora, acentos e corte).
export function gerarTesteEscPos(nomeImpressora) {
  const c = new Cupom().init().alinhar("c");
  c.negrito(true).tamanho(1, 2).linha("TESTE ESC/POS").tamanho(1, 1).negrito(false);
  c.linha(nomeImpressora || "impressora padrão").linha(new Date().toLocaleString("pt-BR")).pular(1);
  c.alinhar("l").linha("Acentos: ação, pão, café, Ç, à, ê, ú").linha("0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  c.tracejada().dupla("Buffet (0,396 kg)", "R$ 37,58").negrito(true).tamanho(2, 2).dupla("TOTAL", "R$37,58").tamanho(1, 1).negrito(false);
  try { const { bits, W, H } = qrBits("https://www.brasarestaurante.com.br", 4); c.alinhar("c").raster(bits, W, H); } catch { /* sem QR */ }
  c.pular(3).cortar();
  return c.bytes();
}
