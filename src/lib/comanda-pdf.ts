import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { ehLinhaDeBorda, linhasComSabores } from "@/lib/sabores-linhas";

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
  qr?: string | null;      // texto do QR (pedido de entrega: "ENTREGA:<id>") — o app do motoboy lê
  qrRotulo?: string | null;
  /** Destaque em moldura no topo (delivery: "ENTREGA ÀS 11:30"). */
  destaque?: string | null;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function gerarComandaPdf(d: ComandaPdfDados, cfg?: ComandaConfig | null): Promise<Buffer> {
  const c = { ...DEF, ...(cfg ?? {}) };
  // Papel de 80 mm imprime ~72 mm (58 → ~48): gerar na largura útil, com
  // margem, senão as laterais saem cortadas (27/11/2026).
  const W = (c.largura <= 60 ? 48 : 72) * MM;
  const pad = 9;
  const contentW = W - pad * 2;
  const fItem = c.largura <= 58 ? 12 : 15;

  // altura estimada
  let h = 130;
  if (c.garcom && d.garcom) h += 14;
  for (const it of d.itens) {
    const ls = linhasComSabores(it.descricao || "");
    h += 30 + (ls.length - 1) * 18;
    // Observação em caixa, letra maior (pode quebrar em várias linhas).
    for (const l of ls.slice(1)) if (/^obs\b/i.test(l.trim())) h += 16 + Math.floor(l.length / 26) * 20;
  }
  if (c.agrupar) h += 22 * new Set(d.itens.map((i) => i.categoria || "Outros")).size;
  if (c.precos) h += 26;
  if (c.qtdCat) h += 30;
  if (d.observacao) h += 30;
  if (d.qr) h += 100;
  if (d.destaque) h += 18 + 22 * d.destaque.split("\n").length;
  h += 46;
  // Sempre mais alta que larga — página "deitada" faz a impressora girar a comanda.
  h = Math.max(h, W + 20);

  const doc = new PDFDocument({ size: [W, h], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (x: Buffer) => chunks.push(x));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  doc.fillColor("#000");
  let y = 8;
  const linha = () => { doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(1).dash(2, { space: 2 }).stroke().undash(); y += 8; };

  // O nome da impressora ("PIZZARIA (ELGIN I8)") saiu do cabeçalho: não ajuda a cozinha.
  if (d.destaque) {
    doc.font("Helvetica-Bold").fontSize(c.largura <= 58 ? 13 : 17);
    const alt = doc.heightOfString(d.destaque, { width: contentW - 8 }) + 8;
    doc.rect(pad, y, contentW, alt).lineWidth(2.5).stroke("#000");
    doc.fillColor("#000").text(d.destaque, pad + 4, y + 4, { width: contentW - 8, align: "center" });
    y += alt + 6;
  }
  doc.font("Helvetica-Bold").fontSize(c.largura <= 58 ? 15 : 18).text(d.mesa, pad, y, { width: contentW, align: "center" });
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
    const linhas = linhasComSabores(it.descricao || ""); // um sabor por linha
    const valor = c.precos && it.preco != null ? it.preco * it.qtd : null;
    if (valor != null) total += valor;
    doc.font("Helvetica-Bold").fontSize(fItem);
    if (valor != null) {
      doc.text(`${Number.isInteger(Number(it.qtd)) ? `${it.qtd}x  ` : ""}${linhas[0]}`, pad, y, { width: contentW - 60 });
      doc.font("Helvetica").fontSize(11).text(brl(valor), W - pad - 60, y, { width: 60, align: "right" });
      doc.font("Helvetica-Bold").fontSize(fItem);
      y = doc.y;
    } else {
      doc.text(`${Number.isInteger(Number(it.qtd)) ? `${it.qtd}x  ` : ""}${linhas[0]}`, pad, y, { width: contentW });
      y = doc.y;
    }
    for (let i = 1; i < linhas.length; i++) {
      const obs = linhas[i];
      // Título da etapa da marmita ("» Carne"): em moldura, pra separar
      // (pedido do Rafael: "quadradinho em volta", 27/11/2026).
      if (obs.startsWith("» ")) {
        // Borda da pizza: logo embaixo do tamanho, maior e com moldura grossa
        // — é o primeiro detalhe que o pizzaiolo faz (27/11/2026).
        const borda = ehLinhaDeBorda(obs);
        y += 3;
        const tit = obs.slice(2).toUpperCase();
        doc.font("Helvetica-Bold").fontSize(borda ? 14 : 11.5).fillColor("#000");
        const wT = Math.min(contentW - 8, doc.widthOfString(tit) + 12);
        const hT = doc.heightOfString(tit, { width: wT - 10 }) + (borda ? 6 : 4);
        doc.rect(pad + 6, y, wT, hT).lineWidth(borda ? 2.6 : 1.6).stroke("#000");
        doc.text(tit, pad + 11, y + (borda ? 3.5 : 2.5), { width: wT - 10 });
        y += hT + 3;
        continue;
      }
      // Observação bem visível: caixa da largura toda, letra grande em negrito.
      if (/^obs\b/i.test(obs.trim())) {
        y += 3;
        const txt = `OBS: ${obs.trim().replace(/^obs\.?:?\s*/i, "")}`;
        doc.font("Helvetica-Bold").fontSize(13).fillColor("#000");
        const hO = doc.heightOfString(txt, { width: contentW - 14 }) + 8;
        doc.rect(pad + 2, y, contentW - 4, hO).lineWidth(2.2).stroke("#000");
        doc.text(txt, pad + 8, y + 4, { width: contentW - 14 });
        y += hO + 4;
        continue;
      }
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
  if (d.qr) {
    try {
      const png = await QRCode.toBuffer(d.qr, { type: "png", errorCorrectionLevel: "M", margin: 1, scale: 4 });
      const lado = 80;
      doc.image(png, pad + (contentW - lado) / 2, y, { width: lado, height: lado });
      y += lado + 2;
      doc.font("Helvetica").fontSize(8).fillColor("#000").text(d.qrRotulo || "Motoboy: leia este QR no app pra pegar a entrega", pad, y, { width: contentW, align: "center" });
      y = doc.y + 4;
    } catch { /* sem QR */ }
  }
  doc.font("Helvetica").fontSize(8).fillColor("#444").text("Brasa · impresso automaticamente", pad, y, { width: contentW, align: "center" });

  doc.end();
  return fim;
}
