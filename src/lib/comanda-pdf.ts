import PDFDocument from "pdfkit";

const MM = 2.834645669;

export type ComandaConfig = {
  largura?: number;   // mm (58 ou 80)
  precos?: boolean;   // mostra valores + total
  garcom?: boolean;   // mostra o nome do garçom
  hora?: boolean;     // mostra a hora
  agrupar?: boolean;  // agrupa por categoria (título em negrito)
  qtdCat?: boolean;   // resumo de quantidade por categoria no fim
  destObs?: boolean;  // observações em destaque
};
const DEF: Required<ComandaConfig> = {
  largura: 80, precos: false, garcom: true, hora: true, agrupar: false, qtdCat: false, destObs: false,
};

export type ComandaItem = { qtd: number; descricao: string; preco?: number; categoria?: string };
export type ComandaPdfDados = {
  via: string | null;
  mesa: string;
  numero: number | null;
  hora: string;
  garcom: string | null;
  observacao: string | null;
  itens: ComandaItem[];
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function gerarComandaPdf(d: ComandaPdfDados, cfg?: ComandaConfig | null): Promise<Buffer> {
  const c = { ...DEF, ...(cfg ?? {}) };
  const W = c.largura * MM;
  const pad = 6;
  const contentW = W - pad * 2;
  const fItem = c.largura <= 58 ? 12 : 15;

  // altura estimada
  let h = 130;
  if (c.garcom && d.garcom) h += 14;
  for (const it of d.itens) h += 30 + ((it.descricao || "").split("\n").length - 1) * 18;
  if (c.agrupar) h += 22 * new Set(d.itens.map((i) => i.categoria || "Outros")).size;
  if (c.precos) h += 26;
  if (c.qtdCat) h += 30;
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
  const renderItem = (it: ComandaItem) => {
    const linhas = (it.descricao || "").split("\n");
    const valor = c.precos && it.preco != null ? it.preco * it.qtd : null;
    if (valor != null) total += valor;
    doc.font("Helvetica-Bold").fontSize(fItem);
    if (valor != null) {
      doc.text(`${it.qtd}x  ${linhas[0]}`, pad, y, { width: contentW - 60 });
      doc.font("Helvetica").fontSize(11).text(brl(valor), W - pad - 60, y, { width: 60, align: "right" });
      doc.font("Helvetica-Bold").fontSize(fItem);
      y = doc.y;
    } else {
      doc.text(`${it.qtd}x  ${linhas[0]}`, pad, y, { width: contentW });
      y = doc.y;
    }
    for (let i = 1; i < linhas.length; i++) {
      const obs = linhas[i];
      if (c.destObs) doc.font("Helvetica-Bold").fontSize(12).fillColor("#000").text(`  ${obs}`, pad, y, { width: contentW });
      else doc.font("Helvetica").fontSize(11).text(`     ${obs}`, pad, y, { width: contentW });
      y = doc.y;
    }
    y += 4;
  };

  if (c.agrupar) {
    const grupos = new Map<string, ComandaItem[]>();
    for (const it of d.itens) { const k = it.categoria || "Outros"; (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(it); }
    for (const [cat, its] of grupos) {
      doc.font("Helvetica-Bold").fontSize(10).text(cat.toUpperCase(), pad, y, { width: contentW });
      y = doc.y + 2;
      for (const it of its) renderItem(it);
      y += 2;
    }
  } else {
    for (const it of d.itens) renderItem(it);
  }

  y += 2; linha();

  if (c.qtdCat) {
    const porCat = new Map<string, number>();
    for (const it of d.itens) { const k = it.categoria || "Outros"; porCat.set(k, (porCat.get(k) ?? 0) + it.qtd); }
    const resumo = [...porCat.entries()].map(([k, n]) => `${k}: ${n}`).join("   ·   ");
    doc.font("Helvetica").fontSize(9).text(`Qtd por categoria — ${resumo}`, pad, y, { width: contentW });
    y = doc.y + 4;
  }

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
