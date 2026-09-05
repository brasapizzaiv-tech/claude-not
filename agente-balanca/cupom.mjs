// Cupom da balança em PDF (72 mm de largura, altura conforme o conteúdo) —
// mesmo desenho do cupom que o quiosque imprimia pelo navegador.
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const MM = 2.834645669;
const LARG = 72 * MM;
const PAD = 3 * MM;
const W = LARG - PAD * 2;

const moeda = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const kg = (n) => Number(n || 0).toFixed(3).replace(".", ",") + " kg";

// d: { nome, endereco, telefone, msg, numero, id, codigoOffline, peso, tara,
//      valor, liquido, livre, viradaLivre, antes, urlComanda, logo (Buffer|null) }
function desenhar(doc, d, qr) {
  let y = PAD;
  const centro = (txt, size, bold = false, gap = 0) => {
    doc.font(bold ? "Courier-Bold" : "Courier").fontSize(size).text(txt, PAD, y, { width: W, align: "center" });
    y = doc.y + gap;
  };
  if (d.logo) {
    try { doc.image(d.logo, PAD + (W - 22 * MM) / 2, y, { fit: [22 * MM, 22 * MM], align: "center" }); y += 22 * MM + 1 * MM; } catch { /* sem logo */ }
  }
  centro(String(d.nome || "").toUpperCase(), 13, true);
  const linha2 = [d.endereco, d.telefone].filter(Boolean).join(" · ");
  if (linha2) centro(linha2, 8);
  y += 1 * MM;
  centro("COMANDA · BALANÇA", 8);
  centro(d.codigoOffline ? d.codigoOffline : `#${d.numero}`, 26, true, 2 * MM);

  if (Number(d.peso) > 0) {
    const col = W / 3;
    const cab = ["PESO", "TARA", "VALOR"];
    const val = [kg(d.peso), kg(d.tara), moeda(d.valor)];
    doc.font("Courier").fontSize(7);
    cab.forEach((c, i) => doc.text(c, PAD + col * i, y, { width: col, align: "center" }));
    y = doc.y;
    doc.font("Courier-Bold").fontSize(9);
    val.forEach((v, i) => doc.text(v, PAD + col * i, y, { width: col, align: "center" }));
    y = doc.y;
  } else {
    centro("VALOR", 7);
    centro(moeda(d.valor), 9, true);
  }
  if (d.livre) centro(d.viradaLivre ? "★ AGORA É BUFFET LIVRE ★" : "BUFFET LIVRE", 11, true);
  if (d.viradaLivre && d.antes != null) centro(`era ${moeda(d.antes)} por peso`, 8);

  y += 2 * MM;
  if (d.codigoOffline) {
    const txt = `SEM INTERNET NO MOMENTO\nGuarde este cupom — código ${d.codigoOffline}.\nA comanda entra no sistema automaticamente.`;
    doc.font("Courier-Bold").fontSize(9);
    const h = doc.heightOfString(txt, { width: W - 4 * MM, align: "center" }) + 4 * MM;
    doc.rect(PAD, y, W, h).stroke("#000");
    doc.text(txt, PAD + 2 * MM, y + 2 * MM, { width: W - 4 * MM, align: "center" });
    y += h + 2 * MM;
  } else if (qr) {
    const s = 40 * MM;
    doc.image(qr, PAD + (W - s) / 2, y, { width: s, height: s });
    y += s + 1 * MM;
  }
  centro(new Date().toLocaleString("pt-BR"), 8, false, 1 * MM);
  if (d.msg) centro(String(d.msg), 9, false, 1 * MM);

  y += 1 * MM;
  doc.moveTo(PAD, y).lineTo(PAD + W, y).dash(2, { space: 2 }).stroke("#000").undash();
  y += 2 * MM;
  const item = Number(d.peso) > 0 ? `Buffet (${kg(d.liquido)})` : "Buffet livre (à vontade)";
  doc.font("Courier").fontSize(10).text(item, PAD, y, { width: W * 0.65 });
  doc.text(moeda(d.valor), PAD + W * 0.65, y, { width: W * 0.35, align: "right" });
  y = doc.y + 1 * MM;
  doc.font("Courier-Bold").fontSize(13).text("TOTAL", PAD, y, { width: W * 0.5 });
  doc.text(moeda(d.valor), PAD + W * 0.5, y, { width: W * 0.5, align: "right" });
  y = doc.y + 4 * MM;
  return y;
}

export async function gerarCupomPdf(d) {
  const qr = d.codigoOffline || !d.urlComanda ? null : await QRCode.toBuffer(d.urlComanda, { margin: 1, width: 300 });
  // Mede a altura primeiro (página grande), depois gera na altura exata.
  const m = new PDFDocument({ size: [LARG, 2000], margin: 0 });
  const altura = desenhar(m, d, qr);
  m.end();
  const doc = new PDFDocument({ size: [LARG, Math.max(altura, 40 * MM)], margin: 0 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const fim = new Promise((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  desenhar(doc, d, qr);
  doc.end();
  return fim;
}
