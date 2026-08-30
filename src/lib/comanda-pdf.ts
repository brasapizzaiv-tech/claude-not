import PDFDocument from "pdfkit";

const MM = 2.834645669;

export type ComandaPdfDados = {
  mesa: string;
  numero: number | null;
  hora: string; // "HH:MM"
  garcom: string | null;
  observacao: string | null;
  itens: { qtd: number; descricao: string }[];
};

// Comanda de cozinha em bobina 80mm (itens grandes, sem preços).
export async function gerarComandaPdf(d: ComandaPdfDados): Promise<Buffer> {
  const W = 80 * MM;
  const pad = 6;
  const contentW = W - pad * 2;

  // altura estimada pelo conteúdo (bobina — evita folha em branco)
  let h = 150;
  for (const it of d.itens) {
    const linhas = (it.descricao || "").split("\n");
    h += 30 + (linhas.length - 1) * 16;
  }
  if (d.observacao) h += 30;
  h += 50;

  const doc = new PDFDocument({ size: [W, h], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  doc.fillColor("#000");
  let y = 8;
  const linha = () => { doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(1).dash(2, { space: 2 }).stroke().undash(); y += 8; };

  doc.font("Helvetica-Bold").fontSize(11).text("COMANDA — COZINHA", pad, y, { width: contentW, align: "center" });
  y = doc.y + 4;
  doc.font("Helvetica-Bold").fontSize(20).text(d.mesa, pad, y, { width: contentW, align: "center" });
  y = doc.y + 2;
  doc.font("Helvetica").fontSize(10).text(
    `${d.numero ? `Comanda ${d.numero}` : ""}${d.numero ? "  ·  " : ""}${d.hora}`,
    pad, y, { width: contentW, align: "center" },
  );
  y = doc.y + 1;
  if (d.garcom) { doc.fontSize(10).text(`Garçom: ${d.garcom}`, pad, y, { width: contentW, align: "center" }); y = doc.y; }
  y += 6; linha();

  for (const it of d.itens) {
    const linhas = (it.descricao || "").split("\n");
    doc.font("Helvetica-Bold").fontSize(15).text(`${it.qtd}x  ${linhas[0]}`, pad, y, { width: contentW });
    y = doc.y;
    for (let i = 1; i < linhas.length; i++) {
      doc.font("Helvetica").fontSize(11).text(`     ${linhas[i]}`, pad, y, { width: contentW });
      y = doc.y;
    }
    y += 4;
  }

  y += 2; linha();
  if (d.observacao) {
    doc.font("Helvetica-Bold").fontSize(11).text(`Obs.: ${d.observacao}`, pad, y, { width: contentW });
    y = doc.y + 4;
  }
  doc.font("Helvetica").fontSize(8).fillColor("#444").text("Brasa · impresso automaticamente", pad, y, { width: contentW, align: "center" });

  doc.end();
  return fim;
}
