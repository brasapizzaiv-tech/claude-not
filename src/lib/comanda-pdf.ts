import PDFDocument from "pdfkit";

const MM = 2.834645669;

export type ComandaConfig = {
  largura?: number;  // mm (58 ou 80)
  precos?: boolean;  // mostra valores + total
  garcom?: boolean;  // mostra o nome do garçom
  hora?: boolean;    // mostra a hora
};
const DEF: Required<ComandaConfig> = { largura: 80, precos: false, garcom: true, hora: true };

export type ComandaPdfDados = {
  via: string | null;
  mesa: string;
  numero: number | null;
  hora: string;
  garcom: string | null;
  observacao: string | null;
  itens: { qtd: number; descricao: string; preco?: number }[];
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Comanda em bobina (58 ou 80mm). Kitchen: sem preços; conta: com preços.
export async function gerarComandaPdf(d: ComandaPdfDados, cfg?: ComandaConfig | null): Promise<Buffer> {
  const c = { ...DEF, ...(cfg ?? {}) };
  const W = c.largura * MM;
  const pad = 6;
  const contentW = W - pad * 2;
  const fItem = c.largura <= 58 ? 12 : 15;

  let h = 130;
  if (c.garcom && d.garcom) h += 14;
  for (const it of d.itens) h += 30 + ((it.descricao || "").split("\n").length - 1) * 16;
  if (c.precos) h += 26;
  if (d.observacao) h += 30;
  h += 46;

  const doc = new PDFDocument({ size: [W, h], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (x: Buffer) => chunks.push(x));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  doc.fillColor("#000");
  let y = 8;
  const linha = () => { doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(1).dash(2, { space: 2 }).stroke().undash(); y += 8; };

  doc.font("Helvetica-Bold").fontSize(11).text(`COMANDA${d.via ? " — " + d.via.toUpperCase() : ""}`, pad, y, { width: contentW, align: "center" });
  y = doc.y + 4;
  doc.font("Helvetica-Bold").fontSize(c.largura <= 58 ? 16 : 20).text(d.mesa, pad, y, { width: contentW, align: "center" });
  y = doc.y + 2;
  doc.font("Helvetica").fontSize(10).text(
    `${d.numero ? `Comanda ${d.numero}` : ""}${d.numero && c.hora ? "  ·  " : ""}${c.hora ? d.hora : ""}`,
    pad, y, { width: contentW, align: "center" },
  );
  y = doc.y + 1;
  if (c.garcom && d.garcom) { doc.fontSize(10).text(`Garçom: ${d.garcom}`, pad, y, { width: contentW, align: "center" }); y = doc.y; }
  y += 6; linha();

  let total = 0;
  for (const it of d.itens) {
    const linhas = (it.descricao || "").split("\n");
    const valor = c.precos && it.preco != null ? it.preco * it.qtd : null;
    if (valor != null) total += valor;
    doc.font("Helvetica-Bold").fontSize(fItem);
    if (valor != null) {
      doc.text(`${it.qtd}x  ${linhas[0]}`, pad, y, { width: contentW - 60, continued: false });
      const yLinha = y;
      doc.font("Helvetica").fontSize(11).text(brl(valor), W - pad - 60, yLinha, { width: 60, align: "right" });
      doc.font("Helvetica-Bold").fontSize(fItem);
      y = doc.y;
    } else {
      doc.text(`${it.qtd}x  ${linhas[0]}`, pad, y, { width: contentW });
      y = doc.y;
    }
    for (let i = 1; i < linhas.length; i++) {
      doc.font("Helvetica").fontSize(11).text(`     ${linhas[i]}`, pad, y, { width: contentW });
      y = doc.y;
    }
    y += 4;
  }

  y += 2; linha();
  if (c.precos) {
    doc.font("Helvetica-Bold").fontSize(13).text("TOTAL", pad, y, { width: contentW / 2 });
    doc.text(brl(total), pad + contentW / 2, y, { width: contentW / 2, align: "right" });
    y = doc.y + 4;
  }
  if (d.observacao) { doc.font("Helvetica-Bold").fontSize(11).text(`Obs.: ${d.observacao}`, pad, y, { width: contentW }); y = doc.y + 4; }
  doc.font("Helvetica").fontSize(8).fillColor("#444").text("Brasa · impresso automaticamente", pad, y, { width: contentW, align: "center" });

  doc.end();
  return fim;
}
