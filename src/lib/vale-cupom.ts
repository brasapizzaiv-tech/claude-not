import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { CupomEscPos, pngParaBits, qrBits } from "@/lib/escpos";
import { dataBR, formatarCodigo, type ValeCartao } from "@/lib/vale-presente";

// Cupom do vale-presente na térmica do caixa, pra entregar em mãos: logo,
// valor grande, código grande + QR (o leitor do caixa lê direto no campo do
// código), pra quem, de quem, recado e validade. ESC/POS pro agente novo
// (fonte da impressora, nítida) e PDF pro antigo.

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MM = 2.834645669;

export function gerarValeEscPos(d: ValeCartao, cols: 32 | 48 = 48, logo?: Buffer | null): Buffer {
  const c = new CupomEscPos(cols);
  c.init().alinhar("c");
  if (logo) {
    try { const { bits, W, H } = pngParaBits(logo, cols <= 32 ? 160 : 208); c.raster(bits, W, H).pular(1); } catch { /* sem logo */ }
  }
  c.negrito(true).tamanho(2, 2).linha("VALE-PRESENTE").tamanho(1, 1).negrito(false).pular(1);
  c.negrito(true).tamanho(2, 3).linha(brl(d.valor)).tamanho(1, 1).negrito(false);
  if (d.saldo < d.valor - 0.005) c.linha(`Saldo atual: ${brl(d.saldo)}`);
  c.pular(1);
  if (d.para) c.paragrafo(`Para: ${d.para}`);
  if (d.de) c.paragrafo(`De: ${d.de}`);
  if (d.mensagem) { c.pular(1); c.paragrafo(`"${d.mensagem}"`); }
  c.pular(1).tracejada().linha("CÓDIGO").negrito(true).tamanho(2, 2).linha(formatarCodigo(d.codigo)).tamanho(1, 1).negrito(false);
  try { const { bits, W, H } = qrBits(d.codigo, 6, Math.min(c.dots, 260)); c.pular(1).raster(bits, W, H); } catch { /* o código está por extenso */ }
  c.pular(1).linha(`Válido até ${dataBR(d.validade)}`).tracejada();
  c.paragrafo("Apresente este código no caixa. Pode ser usado aos poucos até acabar o saldo. Não é trocado por dinheiro.");
  c.pular(4).cortar();
  return c.bytes();
}

function desenhar(doc: PDFKit.PDFDocument, d: ValeCartao, W: number, logo: Buffer | null, qr: Buffer) {
  const pad = 7, cw = W - pad * 2;
  let y = 8;
  doc.fillColor("#000");
  if (logo) {
    try { const lw = Math.min(cw * 0.42, 30 * MM); doc.image(logo, (W - lw) / 2, y, { width: lw }); y += lw + 4; } catch { /* sem logo */ }
  }
  doc.font("Helvetica-Bold").fontSize(15).text("VALE-PRESENTE", pad, y, { width: cw, align: "center" }); y = doc.y + 4;
  doc.fontSize(24).text(brl(d.valor), pad, y, { width: cw, align: "center" }); y = doc.y + 2;
  if (d.saldo < d.valor - 0.005) { doc.font("Helvetica").fontSize(9).text(`Saldo atual: ${brl(d.saldo)}`, pad, y, { width: cw, align: "center" }); y = doc.y; }
  y += 6;
  doc.font("Helvetica").fontSize(10);
  if (d.para) { doc.text(`Para: ${d.para}`, pad, y, { width: cw, align: "center" }); y = doc.y + 1; }
  if (d.de) { doc.text(`De: ${d.de}`, pad, y, { width: cw, align: "center" }); y = doc.y + 1; }
  if (d.mensagem) { doc.font("Helvetica-Oblique").fontSize(9).text(`"${d.mensagem}"`, pad, y + 4, { width: cw, align: "center" }); y = doc.y + 1; }
  y += 8;
  doc.font("Helvetica").fontSize(8).text("CÓDIGO", pad, y, { width: cw, align: "center" }); y = doc.y + 1;
  doc.font("Courier-Bold").fontSize(20).text(formatarCodigo(d.codigo), pad, y, { width: cw, align: "center" }); y = doc.y + 4;
  const q = 26 * MM;
  doc.image(qr, (W - q) / 2, y, { width: q }); y += q + 6;
  doc.font("Helvetica-Bold").fontSize(10).text(`Válido até ${dataBR(d.validade)}`, pad, y, { width: cw, align: "center" }); y = doc.y + 4;
  doc.font("Helvetica").fontSize(7.5).text("Apresente este código no caixa. Pode ser usado aos poucos até acabar o saldo. Não é trocado por dinheiro.", pad, y, { width: cw, align: "center" });
  return doc.y;
}

export async function gerarValePdf(d: ValeCartao, larguraMm = 72, logo?: Buffer | null): Promise<Buffer> {
  const W = Math.min(Math.max(larguraMm || 72, 44), 110) * MM;
  const qr = await QRCode.toBuffer(d.codigo, { errorCorrectionLevel: "M", margin: 1, width: 300 });
  const medidor = new PDFDocument({ size: [W, 4000], margin: 0 });
  const yFinal = desenhar(medidor, d, W, logo ?? null, qr);
  medidor.end();
  const h = Math.max(Math.ceil(yFinal + 14), W + 20);
  const doc = new PDFDocument({ size: [W, h], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (x: Buffer) => chunks.push(x));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  desenhar(doc, d, W, logo ?? null, qr);
  doc.end();
  return fim;
}
