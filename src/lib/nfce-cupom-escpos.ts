import { CupomEscPos, pngParaBits, qrBits } from "@/lib/escpos";
import { lerXml, type NfceCupom } from "@/lib/nfce-cupom-pdf";

// Cupom da NFC-e em ESC/POS — mesmo conteúdo do PDF (nfce-cupom-pdf.ts), mas
// com a fonte da própria impressora térmica: sai preto e nítido como o cupom
// da balança. O PDF continua existindo pro agente antigo e pra tela.

const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n2 = (s: string) => Number(String(s).replace(",", ".")) || 0;
const qtd = (s: string) => {
  const v = n2(s);
  return Number.isInteger(v) ? String(v) : v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};
const cnpjBonito = (s: string) =>
  s.length === 14 ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : s;
const cpfBonito = (s: string) =>
  s.length === 11 ? s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : s;
const dataBonita = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function desenhar(c: CupomEscPos, d: NfceCupom, logo: Buffer | null) {
  const cols = c.cols;
  c.init().alinhar("c");

  // ---------- emitente ----------
  if (logo) {
    try { const { bits, W, H } = pngParaBits(logo, cols <= 32 ? 200 : 256); c.raster(bits, W, H).pular(1); } catch { /* sem logo */ }
  }
  c.negrito(true).tamanho(1, 2).paragrafo(d.fantasia || d.emitente).tamanho(1, 1).negrito(false);
  if (d.fantasia && d.emitente && d.fantasia !== d.emitente) c.paragrafo(d.emitente);
  c.paragrafo(`CNPJ ${cnpjBonito(d.cnpj)}${d.ie ? ` · IE ${d.ie}` : ""}`);
  if (d.endereco) c.paragrafo(d.endereco);
  if (d.cidade) c.paragrafo(d.cidade);
  c.alinhar("l").tracejada().alinhar("c");
  c.negrito(true).tamanho(1, 2).linha("DANFE NFC-e").tamanho(1, 1).negrito(false);
  c.paragrafo("Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica");
  if (d.homologacao) c.negrito(true).paragrafo("*** SEM VALOR FISCAL — HOMOLOGAÇÃO ***").negrito(false);
  if (d.contingencia) c.negrito(true).paragrafo("*** EMITIDA EM CONTINGÊNCIA ***").negrito(false);
  c.alinhar("l").tracejada();

  // ---------- itens ----------
  c.negrito(true).dupla("COD DESCRIÇÃO", "QTD x UNIT   TOTAL").negrito(false);
  c.tracejada();
  for (const it of d.itens) {
    c.paragrafo(`${it.n} ${it.desc}`);
    // quantidade à esquerda (recuada) e o total em negrito à direita, na mesma linha
    const total = brl(n2(it.total));
    const esq = `  ${qtd(it.qtd)} ${it.un} x ${brl(n2(it.unit))}`.slice(0, cols - total.length - 1);
    c.texto(esq + " ".repeat(cols - esq.length - total.length)).negrito(true).linha(total).negrito(false);
  }
  c.tracejada();

  // ---------- totais ----------
  c.dupla("Qtd. total de itens", String(d.itens.length));
  c.dupla("Valor total", `R$ ${brl(d.totalProdutos)}`);
  if (d.desconto > 0.004) c.dupla("Desconto", `- R$ ${brl(d.desconto)}`);
  c.negrito(true).tamanho(1, 2).dupla("VALOR A PAGAR", `R$ ${brl(d.totalNota)}`).tamanho(1, 1).negrito(false);
  for (const p of d.pagamentos) c.dupla(p.forma, `R$ ${brl(p.valor)}`);
  if (d.troco > 0.004) c.dupla("Troco", `R$ ${brl(d.troco)}`);
  if (d.tributos > 0.004) c.paragrafo(`Tributos aprox. R$ ${brl(d.tributos)} — Lei 12.741/2012`);
  c.tracejada();

  // ---------- consulta / chave ----------
  c.alinhar("c");
  c.linha("Consulte pela Chave de Acesso em");
  c.negrito(true).paragrafo(d.urlChave || "www.sefaz.rs.gov.br/nfce/consulta").negrito(false);
  const grupos = d.chave.match(/.{1,4}/g) ?? [d.chave];
  // 11 grupos de 4: em 48 colunas cabem 6 por linha (29 chars); em 32, 5 (24 chars)
  const porLinha = cols <= 32 ? 5 : 6;
  for (let i = 0; i < grupos.length; i += porLinha) c.linha(grupos.slice(i, i + porLinha).join(" "));
  c.pular(1);

  // ---------- consumidor ----------
  c.negrito(true);
  if (d.cpfDest) c.linha(`CONSUMIDOR — CPF ${cpfBonito(d.cpfDest)}`);
  else if (d.cnpjDest) c.paragrafo(`CONSUMIDOR — CNPJ ${cnpjBonito(d.cnpjDest)}`);
  else c.linha("CONSUMIDOR NÃO IDENTIFICADO");
  c.negrito(false);
  if (d.nomeDest) c.paragrafo(d.nomeDest);
  c.paragrafo(`NFC-e nº ${d.numero}  Série ${d.serie}  ${dataBonita(d.emissao)}`);
  if (d.protocolo) c.paragrafo(`Protocolo de autorização: ${d.protocolo}`);
  if (d.protocoloEm) c.linha(dataBonita(d.protocoloEm));
  c.pular(1);

  // ---------- QR ----------
  if (d.qrCode) {
    try { const { bits, W, H } = qrBits(d.qrCode, 5, Math.min(c.dots, 400)); c.raster(bits, W, H).pular(1); } catch { /* sem QR: a chave está por extenso */ }
  }
  c.linha("Obrigado pela preferência!");
  c.pular(3).cortar();
}

// Gera o cupom (bytes ESC/POS) a partir do XML autorizado da NFC-e.
export function gerarNfceCupomEscPos(xml: string, cols: 32 | 48 = 48, logo?: Buffer | null): Buffer {
  const d = lerXml(xml);
  const c = new CupomEscPos(cols);
  desenhar(c, d, logo ?? null);
  return c.bytes();
}
