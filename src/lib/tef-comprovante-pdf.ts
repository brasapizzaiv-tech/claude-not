import PDFDocument from "pdfkit";

// Comprovante do cartão (TEF) na térmica: as linhas vêm prontas do gerenciador
// (via cliente / via loja), em fonte fixa como a maquininha imprime. Mesmo
// padrão dos outros documentos: largura útil da impressora, retrato, altura medida.
const MM = 2.834645669;

export type ComprovanteTef = {
  titulo: string;          // "VIA CLIENTE" | "VIA ESTABELECIMENTO"
  linhas: string[];
  rodape?: string | null;  // ex.: "Comanda #12 · 10/09/2026 12:41"
};

function desenhar(doc: PDFKit.PDFDocument, d: ComprovanteTef, W: number) {
  const pad = 7;
  const cw = W - pad * 2;
  let y = 8;
  doc.fillColor("#000");
  doc.font("Helvetica-Bold").fontSize(9).text(d.titulo, pad, y, { width: cw, align: "center" });
  y = doc.y + 4;
  // Courier: cada linha do comprovante foi montada pra 40/48 colunas; fonte
  // fixa mantém o alinhamento que o gerenciador fez.
  const maior = Math.max(1, ...d.linhas.map((l) => l.length));
  const tam = Math.max(6.5, Math.min(9, (cw / maior) * 1.66));
  doc.font("Courier").fontSize(tam);
  for (const linha of d.linhas) {
    doc.text(linha || " ", pad, y, { width: cw, lineBreak: false });
    y += tam + 2;
  }
  if (d.rodape) {
    y += 3;
    doc.font("Helvetica").fontSize(7).text(d.rodape, pad, y, { width: cw, align: "center" });
    y = doc.y;
  }
  return y;
}

export async function gerarComprovanteTefPdf(d: ComprovanteTef, larguraMm = 72): Promise<Buffer> {
  const W = Math.min(Math.max(larguraMm || 72, 44), 110) * MM;
  const medidor = new PDFDocument({ size: [W, 4000], margin: 0 });
  const yFinal = desenhar(medidor, d, W);
  medidor.end();
  const h = Math.max(Math.ceil(yFinal + 10), W + 20);

  const doc = new PDFDocument({ size: [W, h], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (x: Buffer) => chunks.push(x));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  desenhar(doc, d, W);
  doc.end();
  return fim;
}
