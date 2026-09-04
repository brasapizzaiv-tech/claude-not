import PDFDocument from "pdfkit";
import type { EtiquetaConfig } from "./etiqueta-tipos";

// Etiqueta da MARMITA do convênio (Kern) na impressora de etiquetas (Elgin L42,
// 55×55 por padrão). Usa o mesmo formato/calibração da impressora que as
// etiquetas de manipulação (etiqueta_config). Mede e encolhe a letra até caber.

export type MarmitaPdfDados = {
  convenio: string;
  data: string; // AAAA-MM-DD
  horaEntrega: string | null;
  filial: string;
  cliente: string;
  matricula: string | null;
  pratos: string[];
  proteina: string | null;
  salada: string | null;
};

const MM = 2.834645669;

function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

function desenhar(doc: PDFKit.PDFDocument, fe: number, pad: number, W: number, d: MarmitaPdfDados) {
  doc.fillColor("#000");
  doc.font("Helvetica-Bold").fontSize(6.5 * fe).text(
    `${d.convenio.toUpperCase()} · ${dataBR(d.data)}${d.horaEntrega ? ` · entrega ${d.horaEntrega}` : ""}`,
    pad, pad, { width: W, align: "center", characterSpacing: 0.4 },
  );
  doc.font("Helvetica-Bold").fontSize(12 * fe).text(d.filial, pad, doc.y + 2, { width: W, align: "center" });
  doc.font("Helvetica-Bold").fontSize(10 * fe).text(d.cliente, pad, doc.y + 1, { width: W, align: "center" });
  if (d.matricula) doc.font("Helvetica").fontSize(6.5 * fe).text(`matrícula ${d.matricula}`, pad, doc.y, { width: W, align: "center" });
  const y = doc.y + 2;
  doc.lineWidth(0.5).moveTo(pad, y).lineTo(pad + W, y).stroke("#000");
  doc.y = y + 3;
  doc.font("Helvetica-Bold").fontSize(7.5 * fe).text("Pratos:", pad, doc.y, { width: W });
  doc.font("Helvetica").fontSize(7.5 * fe);
  for (const p of d.pratos) doc.text(`• ${p}`, pad + 4, doc.y, { width: W - 4 });
  if (d.proteina) {
    doc.font("Helvetica-Bold").fontSize(7.5 * fe).text(`Proteína: ${d.proteina}`, pad, doc.y + 1.5, { width: W });
  }
  doc.font("Helvetica").fontSize(7.5 * fe).text(`Salada: ${d.salada || "Não"}`, pad, doc.y + 1, { width: W });
  return doc.y;
}

export async function gerarMarmitaPdf(d: MarmitaPdfDados, cfg?: EtiquetaConfig | null): Promise<Buffer> {
  const Wmm = Math.min(Math.max(cfg?.largura || 55, 25), 120);
  const Hmm = Math.min(Math.max(cfg?.altura || 55, 25), 120);
  const Pmm = Math.min(Math.max(cfg?.margem ?? 3, 0), 10);
  const feBase = Math.min(Math.max((cfg?.escala || 100) / 100, 0.6), 1.6);
  const width = Wmm * MM, height = Hmm * MM, pad = Pmm * MM, W = width - pad * 2;

  // Maior letra em que tudo cabe: começa 45% maior que o padrão (marmita com
  // 1 prato fica grande) e encolhe até caber (até 14 vezes).
  let fe = feBase * 1.45;
  for (let i = 0; i < 14; i++) {
    const m = new PDFDocument({ size: [width, height], margin: 0 });
    const fim = desenhar(m, fe, pad, W, d);
    m.end();
    if (fim <= height - pad) break;
    fe *= 0.9;
  }

  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (x: Buffer) => chunks.push(x));
  const pronto = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const dx = Math.max(-15, Math.min(15, Number(cfg?.deslocX) || 0)) * MM;
  const dy = Math.max(-15, Math.min(15, Number(cfg?.deslocY) || 0)) * MM;
  if (dx || dy) doc.translate(dx, dy);
  desenhar(doc, fe, pad, W, d);
  doc.end();
  return pronto;
}
