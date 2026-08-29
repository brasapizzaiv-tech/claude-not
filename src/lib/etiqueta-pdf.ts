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

const CONS: Record<string, string> = { congelado: "CONGELADO", resfriado: "RESFRIADO", ambiente: "AMBIENTE" };

function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// Gera a etiqueta 55x55mm como PDF (mesmo desenho da tela). QR aponta para
// {baseUrl}/e/{id}.
export async function gerarEtiquetaPdf(d: EtiquetaPdfDados, baseUrl: string): Promise<Buffer> {
  const size = 55 * MM;
  const pad = 3 * MM;
  const W = size - pad * 2;
  const doc = new PDFDocument({ size: [size, size], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const qr = await QRCode.toBuffer(`${baseUrl}/e/${d.id}`, { margin: 0, width: 220 });

  doc.fillColor("#000");
  doc.font("Helvetica-Bold").fontSize(7).text("BRASA · MANIPULAÇÃO", pad, pad, { width: W, align: "center", characterSpacing: 0.6 });
  doc.font("Helvetica-Bold").fontSize(13).text(d.produto, pad, doc.y + 2, { width: W, align: "center" });

  if (d.conservacao) {
    const bw = 32 * MM, bh = 13, bx = pad + (W - bw) / 2, by = doc.y + 2;
    doc.lineWidth(0.8).roundedRect(bx, by, bw, bh, 3).stroke();
    doc.font("Helvetica-Bold").fontSize(8.5).text(CONS[d.conservacao] ?? d.conservacao, bx, by + 3, { width: bw, align: "center" });
    doc.y = by + bh;
  }

  if (d.quantidade != null) {
    doc.font("Helvetica").fontSize(9).text(`Qtd: ${d.quantidade} ${d.unidade ?? ""}`, pad, doc.y + 2, { width: W, align: "center" });
  }

  doc.font("Helvetica").fontSize(7).text("VALIDADE", pad, doc.y + 4, { width: W, align: "center" });
  doc.font("Helvetica-Bold").fontSize(18).text(d.validade ? dataBR(d.validade) : "—", pad, doc.y, { width: W, align: "center" });

  // Rodapé: dados de manipulação (esquerda) + QR (direita)
  const qrSize = 16 * MM;
  const baseY = size - pad - qrSize;
  doc.image(qr, size - pad - qrSize, baseY, { width: qrSize, height: qrSize });
  const manip = new Date(d.manipuladoEm).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  doc.font("Helvetica").fontSize(7).text(
    `Manip.: ${manip}\nPor: ${d.colaborador ?? "—"}\nNº ${d.numero}`,
    pad, baseY + qrSize - 30, { width: W - qrSize - 4, lineGap: 1.5 },
  );

  doc.end();
  return fim;
}
