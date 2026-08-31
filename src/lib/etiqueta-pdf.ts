import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const MM = 2.834645669; // pontos por mm

export type EtiquetaPdfDados = {
  id: string;
  numero: number;
  produto: string;
  colaborador: string | null;
  manipuladoEm: string;
  validade: string | null;
  conservacao: string | null;
  quantidade: number | null;
  unidade: string | null;
};

// Formato da etiqueta, configurável por impressora na Central de Impressões.
export type EtiquetaConfig = {
  largura?: number; // mm
  altura?: number;  // mm
  margem?: number;  // mm
  escala?: number;  // % do tamanho da letra (100 = normal)
  qr?: boolean;     // imprime o QR code
};
const DEF: Required<EtiquetaConfig> = { largura: 55, altura: 55, margem: 3, escala: 100, qr: true };

const CONS: Record<string, string> = { congelado: "CONGELADO", resfriado: "RESFRIADO", ambiente: "AMBIENTE" };

function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// Gera a etiqueta como PDF (padrão 55x55mm; formato vem da impressora).
// QR aponta para {baseUrl}/e/{id}.
export async function gerarEtiquetaPdf(d: EtiquetaPdfDados, baseUrl: string, cfg?: EtiquetaConfig | null): Promise<Buffer> {
  const c = { ...DEF, ...(cfg ?? {}) };
  const Wmm = Math.min(Math.max(c.largura || 55, 25), 120);
  const Hmm = Math.min(Math.max(c.altura || 55, 25), 120);
  const Pmm = Math.min(Math.max(c.margem ?? 3, 0), 10);
  const fe = Math.min(Math.max((c.escala || 100) / 100, 0.6), 1.6);

  const width = Wmm * MM;
  const height = Hmm * MM;
  const pad = Pmm * MM;
  const W = width - pad * 2;

  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (x: Buffer) => chunks.push(x));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  doc.fillColor("#000");
  doc.font("Helvetica-Bold").fontSize(7 * fe).text("BRASA · MANIPULAÇÃO", pad, pad, { width: W, align: "center", characterSpacing: 0.6 });
  doc.font("Helvetica-Bold").fontSize(13 * fe).text(d.produto, pad, doc.y + 2, { width: W, align: "center" });

  if (d.conservacao) {
    const bw = Math.min(32 * MM * fe, W), bh = 13 * fe, bx = pad + (W - bw) / 2, by = doc.y + 2;
    doc.lineWidth(0.8).roundedRect(bx, by, bw, bh, 3).stroke();
    doc.font("Helvetica-Bold").fontSize(8.5 * fe).text(CONS[d.conservacao] ?? d.conservacao, bx, by + 3 * fe, { width: bw, align: "center" });
    doc.y = by + bh;
  }

  if (d.quantidade != null) {
    doc.font("Helvetica").fontSize(9 * fe).text(`Qtd: ${d.quantidade} ${d.unidade ?? ""}`, pad, doc.y + 2, { width: W, align: "center" });
  }

  doc.font("Helvetica").fontSize(7 * fe).text("VALIDADE", pad, doc.y + 4, { width: W, align: "center" });
  doc.font("Helvetica-Bold").fontSize(18 * fe).text(d.validade ? dataBR(d.validade) : "—", pad, doc.y, { width: W, align: "center" });

  // Rodapé: dados de manipulação (esquerda) + QR (direita, opcional).
  // O QR escala junto com o tamanho da etiqueta.
  const qrSize = 16 * MM * Math.min(Wmm, Hmm) / 55;
  const baseY = height - pad - qrSize;
  if (c.qr) {
    const qr = await QRCode.toBuffer(`${baseUrl}/e/${d.id}`, { margin: 0, width: 220 });
    doc.image(qr, width - pad - qrSize, baseY, { width: qrSize, height: qrSize });
  }
  const manip = new Date(d.manipuladoEm).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  doc.font("Helvetica").fontSize(7 * fe).text(
    `Manip.: ${manip}\nPor: ${d.colaborador ?? "—"}\nNº ${d.numero}`,
    pad, baseY + qrSize - 30 * fe, { width: c.qr ? W - qrSize - 4 : W, lineGap: 1.5 },
  );

  doc.end();
  return fim;
}
