import { PNG } from "pngjs";
import QRCode from "qrcode";

// Montador de cupom ESC/POS (bytes direto pra impressora térmica, sem PDF e
// sem driver de página). É o mesmo desenho do agente da balança — a fonte da
// própria impressora sai preta e nítida, enquanto o PDF passa pelo driver do
// Windows e vira um cinza serrilhado.
//
// cols = 48 em papel de 80 mm (fonte A), 32 em papel de 58 mm.

const ESC = 0x1b, GS = 0x1d;

// CP1252 (ESC t 16): acentos do português.
const MAPA: Record<string, number> = {
  "á": 0xe1, "à": 0xe0, "â": 0xe2, "ã": 0xe3, "ä": 0xe4, "é": 0xe9, "è": 0xe8, "ê": 0xea, "í": 0xed, "ì": 0xec, "î": 0xee,
  "ó": 0xf3, "ò": 0xf2, "ô": 0xf4, "õ": 0xf5, "ö": 0xf6, "ú": 0xfa, "ù": 0xf9, "û": 0xfb, "ü": 0xfc, "ç": 0xe7,
  "Á": 0xc1, "À": 0xc0, "Â": 0xc2, "Ã": 0xc3, "É": 0xc9, "Ê": 0xca, "Í": 0xcd, "Ó": 0xd3, "Ô": 0xd4, "Õ": 0xd5, "Ú": 0xda, "Ü": 0xdc, "Ç": 0xc7,
  "º": 0xba, "ª": 0xaa, "°": 0xb0, "·": 0xb7, "—": 0x2d, "–": 0x2d, "★": 0x2a, "…": 0x2e,
};
export function encEscPos(txt: string): Buffer {
  const out: number[] = [];
  for (const ch of String(txt)) {
    const c = ch.codePointAt(0) ?? 0x3f;
    if (c < 0x80) out.push(c);
    else if (MAPA[ch] != null) out.push(MAPA[ch]);
    else out.push(0x3f);
  }
  return Buffer.from(out);
}

// Quebra um texto em linhas de até `cols` caracteres, por palavra.
export function quebrarLinhas(txt: string, cols: number): string[] {
  const linhas: string[] = [];
  for (const par of String(txt).split("\n")) {
    let atual = "";
    for (const palavra of par.split(/\s+/).filter(Boolean)) {
      if (palavra.length > cols) {
        if (atual) { linhas.push(atual); atual = ""; }
        for (let i = 0; i < palavra.length; i += cols) linhas.push(palavra.slice(i, i + cols));
        continue;
      }
      if (!atual) atual = palavra;
      else if (atual.length + 1 + palavra.length <= cols) atual += " " + palavra;
      else { linhas.push(atual); atual = palavra; }
    }
    linhas.push(atual);
  }
  return linhas;
}

export class CupomEscPos {
  private partes: Buffer[] = [];
  readonly cols: number;
  readonly dots: number; // largura útil em pontos (203 dpi)
  constructor(cols = 48) {
    this.cols = cols;
    this.dots = cols <= 32 ? 384 : 576;
  }
  raw(...b: number[]) { this.partes.push(Buffer.from(b)); return this; }
  init() { return this.raw(ESC, 0x40).raw(ESC, 0x74, 16); }           // reset + CP1252
  alinhar(a: "l" | "c" | "r") { return this.raw(ESC, 0x61, a === "c" ? 1 : a === "r" ? 2 : 0); }
  negrito(on: boolean) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  tamanho(w = 1, h = 1) { return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1)); }
  texto(t: string) { this.partes.push(encEscPos(t)); return this; }
  linha(t = "") { return this.texto(t).raw(0x0a); }
  // texto longo: quebra por palavra na largura do papel
  paragrafo(t: string, largura = this.cols) { for (const l of quebrarLinhas(t, largura)) this.linha(l); return this; }
  pular(n = 1) { return this.raw(ESC, 0x64, n); }
  cortar() { return this.raw(GS, 0x56, 66, 0); }
  // esquerda + direita na mesma linha; `largura` = cols (ou cols/2 com texto dobrado)
  dupla(esq: string, dir: string, largura = this.cols) {
    const d = String(dir), e = String(esq).slice(0, Math.max(0, largura - d.length - 1));
    return this.linha(e + " ".repeat(Math.max(1, largura - e.length - d.length)) + d);
  }
  tracejada() { return this.linha("-".repeat(this.cols)); }
  // imagem 1 bit (GS v 0): bits[y][x] true = preto
  raster(bits: boolean[][], largura: number, altura: number) {
    const bytesPorLinha = Math.ceil(largura / 8);
    const dados = Buffer.alloc(bytesPorLinha * altura);
    for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) if (bits[y][x]) dados[y * bytesPorLinha + (x >> 3)] |= 0x80 >> (x & 7);
    this.raw(GS, 0x76, 0x30, 0, bytesPorLinha & 0xff, bytesPorLinha >> 8, altura & 0xff, altura >> 8);
    this.partes.push(dados);
    return this;
  }
  bytes() { return Buffer.concat(this.partes); }
}

// PNG → bitmap 1 bit com largura alvo. A logo da Brasa é LARANJA (claro demais
// pra virar preto por brilho — na térmica sairia em branco), então o desenho é
// tratado como SILHUETA: vale a opacidade do pixel. A redução usa média da
// área (o original tem 3000 px; amostrar um ponto só comeria os traços finos).
export function pngParaBits(buf: Buffer, larguraAlvo: number, limiar = 0.42) {
  const png = PNG.sync.read(buf);
  const escala = larguraAlvo / png.width;
  const W = larguraAlvo, H = Math.max(1, Math.round(png.height * escala));
  const passo = png.width / W, passoY = png.height / H;
  const bits: boolean[][] = [];
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * passoY), y1 = Math.max(y0 + 1, Math.floor((y + 1) * passoY));
    const row: boolean[] = [];
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * passo), x1 = Math.max(x0 + 1, Math.floor((x + 1) * passo));
      let soma = 0, n = 0;
      for (let sy = y0; sy < y1 && sy < png.height; sy++) {
        for (let sx = x0; sx < x1 && sx < png.width; sx++) {
          const i = (sy * png.width + sx) * 4;
          const a = png.data[i + 3] / 255;
          const lum = 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
          soma += a * (lum < 110 ? 1 : 0.92);
          n++;
        }
      }
      row.push(n > 0 && soma / n >= limiar);
    }
    bits.push(row);
  }
  return { bits, W, H };
}

// QR → bitmap (cada módulo vira um quadrado de `esc` pontos). Se `maxDots` for
// dado, reduz a escala até caber.
export function qrBits(texto: string, esc = 5, maxDots?: number) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  let e = esc;
  if (maxDots) while (e > 2 && n * e > maxDots) e--;
  const W = n * e;
  const bits: boolean[][] = [];
  for (let y = 0; y < W; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < W; x++) row.push(!!qr.modules.get(Math.floor(y / e), Math.floor(x / e)));
    bits.push(row);
  }
  return { bits, W, H: W };
}
