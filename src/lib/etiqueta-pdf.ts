import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { CONS_LABEL, dataBRcurta, linhasExtras, tipoInfo, type EtiquetaConfig, type EtiquetaDados } from "./etiqueta-tipos";

export type { EtiquetaConfig } from "./etiqueta-tipos";
export type EtiquetaPdfDados = EtiquetaDados;

const MM = 2.834645669; // pontos por mm
const DEF: Required<Pick<EtiquetaConfig, "largura" | "altura" | "margem" | "escala" | "qr">> = { largura: 55, altura: 55, margem: 3, escala: 100, qr: true };

type Geo = { pad: number; W: number };

// Desenha o corpo (tudo menos o rodapé) com a escala de letra `fe` e devolve o
// y final. Roda primeiro num documento de medição pra achar a maior letra que
// cabe acima do rodapé — etiqueta com muitos campos encolhe em vez de invadir o QR.
function desenharCorpo(doc: PDFKit.PDFDocument, fe: number, g: Geo, d: EtiquetaPdfDados, c: EtiquetaConfig) {
  const { pad, W } = g;
  const t = tipoInfo(d.tipo);
  const livre = t.key === "livre";

  doc.fillColor("#000");
  doc.font("Helvetica-Bold").fontSize(7 * fe).text(livre ? "BRASA" : `BRASA · ${t.cabecalho}`, pad, pad, { width: W, align: "center", characterSpacing: 0.6 });
  doc.font("Helvetica-Bold").fontSize(13 * fe).text(d.produto, pad, doc.y + 2, { width: W, align: "center" });
  if (c.categoria && d.categoria) {
    doc.font("Helvetica").fontSize(6.5 * fe).text(`>> ${d.categoria.toUpperCase()}`, pad, doc.y + 1, { width: W, align: "center" });
  }

  if (livre) {
    if (d.texto) doc.font("Helvetica").fontSize(8.5 * fe).text(d.texto, pad, doc.y + 3, { width: W, align: "center" });
  } else {
    if (d.conservacao) {
      const bw = Math.min(32 * MM * fe, W), bh = 13 * fe, bx = pad + (W - bw) / 2, by = doc.y + 2;
      doc.lineWidth(0.8).roundedRect(bx, by, bw, bh, 3).stroke();
      doc.font("Helvetica-Bold").fontSize(8.5 * fe).text(CONS_LABEL[d.conservacao] ?? d.conservacao, bx, by + 3 * fe, { width: bw, align: "center" });
      doc.y = by + bh;
    }
    if (d.quantidade != null) {
      doc.font("Helvetica").fontSize(9 * fe).text(`Qtd: ${d.quantidade} ${d.unidade ?? ""}`, pad, doc.y + 2, { width: W, align: "center" });
    }
    const extras = linhasExtras(d);
    if (extras.length) {
      doc.font("Helvetica").fontSize(6.5 * fe).text(extras.join(" · "), pad, doc.y + 2, { width: W, align: "center" });
    }
  }

  // Bloco da validade (a etiqueta livre só mostra se tiver data).
  if (!livre || d.validade) {
    const rotulo = livre ? "VÁLIDO ATÉ" : "VALIDADE";
    const data = d.validade ? dataBRcurta(d.validade) : "—";
    if (c.barraValidade) {
      const bh = 26 * fe, by = doc.y + 3;
      doc.rect(pad, by, W, bh).fill("#000");
      doc.fillColor("#fff");
      doc.font("Helvetica").fontSize(6.5 * fe).text(rotulo, pad, by + 2.5 * fe, { width: W, align: "center" });
      doc.font("Helvetica-Bold").fontSize(15 * fe).text(data, pad, by + 9.5 * fe, { width: W, align: "center" });
      doc.fillColor("#000");
      doc.y = by + bh;
    } else {
      doc.font("Helvetica").fontSize(7 * fe).text(rotulo, pad, doc.y + 4, { width: W, align: "center" });
      doc.font("Helvetica-Bold").fontSize(18 * fe).text(data, pad, doc.y, { width: W, align: "center" });
    }
  }
  return doc.y;
}

// Gera a etiqueta como PDF (padrão 55x55mm; formato vem da impressora).
// QR aponta para {baseUrl}/e/{id}. O desenho é o mesmo da pré-visualização
// (EtiquetaVisual em src/components/etiqueta-ui.tsx) — mudou aqui, muda lá.
export async function gerarEtiquetaPdf(d: EtiquetaPdfDados, baseUrl: string, cfg?: EtiquetaConfig | null): Promise<Buffer> {
  const c: EtiquetaConfig = { ...DEF, ...(cfg ?? {}) };
  const Wmm = Math.min(Math.max(c.largura || 55, 25), 120);
  const Hmm = Math.min(Math.max(c.altura || 55, 25), 120);
  const Pmm = Math.min(Math.max(c.margem ?? 3, 0), 10);
  const feBase = Math.min(Math.max((c.escala || 100) / 100, 0.6), 1.6);
  const t = tipoInfo(d.tipo);

  const width = Wmm * MM;
  const height = Hmm * MM;
  const pad = Pmm * MM;
  const W = width - pad * 2;
  const g: Geo = { pad, W };

  // Rodapé: dados de manipulação (esquerda) + QR (direita, opcional).
  // O QR escala junto com o tamanho da etiqueta.
  const qrSize = 16 * MM * Math.min(Wmm, Hmm) / 55;
  const baseY = height - pad - qrSize;
  const manip = new Date(d.manipuladoEm).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const linhas = [`${t.dataLabel}: ${manip}`, `Resp.: ${d.colaborador ?? "—"}`, `Nº ${d.numero}`];
  if (c.empresa) linhas.push(c.empresa);
  const rodape = linhas.join("\n");
  const rodapeW = c.qr ? W - qrSize - 4 : W;

  // Acha a maior letra em que corpo + rodapé cabem (encolhe até 8 vezes).
  let fe = feBase;
  for (let i = 0; i < 8; i++) {
    const m = new PDFDocument({ size: [width, height], margin: 0 });
    const yCorpo = desenharCorpo(m, fe, g, d, c);
    const fs = (linhas.length > 3 ? 6.3 : 7) * fe;
    const hRodape = m.font("Helvetica").fontSize(fs).heightOfString(rodape, { width: rodapeW, lineGap: fs * 0.2 });
    m.end();
    const topoRodape = baseY + qrSize - Math.max(hRodape, c.qr ? qrSize : 0);
    if (yCorpo + 2 <= topoRodape) break;
    fe *= 0.92;
  }

  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (x: Buffer) => chunks.push(x));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  desenharCorpo(doc, fe, g, d, c);

  if (c.qr) {
    const qr = await QRCode.toBuffer(`${baseUrl}/e/${d.id}`, { margin: 0, width: 220 });
    doc.image(qr, width - pad - qrSize, baseY, { width: qrSize, height: qrSize });
  }
  const fs = (linhas.length > 3 ? 6.3 : 7) * fe;
  doc.font("Helvetica").fontSize(fs);
  const hRodape = doc.heightOfString(rodape, { width: rodapeW, lineGap: fs * 0.2 });
  doc.fillColor("#000").text(rodape, pad, height - pad - hRodape, { width: rodapeW, lineGap: fs * 0.2 });

  doc.end();
  return fim;
}
