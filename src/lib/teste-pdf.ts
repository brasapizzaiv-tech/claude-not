import PDFDocument from "pdfkit";

const MM = 2.834645669;

// Página de teste de impressão (para conferir a impressora sem depender de pedido).
export async function gerarTestePdf(nome: string, largura: number): Promise<Buffer> {
  const W = (largura || 80) * MM;
  const pad = 6;
  const contentW = W - pad * 2;
  const doc = new PDFDocument({ size: [W, 200], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  doc.fillColor("#000");
  doc.font("Helvetica-Bold").fontSize(13).text("PÁGINA DE TESTE", pad, 12, { width: contentW, align: "center" });
  doc.font("Helvetica-Bold").fontSize(11).text(nome, pad, doc.y + 4, { width: contentW, align: "center" });
  doc.font("Helvetica").fontSize(9).text(agora, pad, doc.y + 2, { width: contentW, align: "center" });

  let y = doc.y + 8;
  doc.moveTo(pad, y).lineTo(W - pad, y).dash(2, { space: 2 }).stroke().undash();
  y += 8;

  doc.font("Helvetica").fontSize(10).text("Se você está lendo isto, a impressão está funcionando!", pad, y, { width: contentW });
  y = doc.y + 6;
  doc.fontSize(9).text(`Largura configurada: ${largura || 80}mm`, pad, y, { width: contentW });
  y = doc.y + 2;
  doc.text("ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 àéíóú çãõ", pad, y, { width: contentW });

  doc.end();
  return fim;
}
