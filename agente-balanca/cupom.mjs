// Cupom da balança em PDF (72 mm de largura, altura conforme o conteúdo) —
// mesmo desenho do cupom que o quiosque imprimia pelo navegador, com letra
// grande/bold (térmica) e logo em preto sólido.
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { PNG } from "pngjs";

const MM = 2.834645669;
const LARG = 72 * MM;
const PAD = 3 * MM;
const W = LARG - PAD * 2;

const moeda = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const kg = (n) => Number(n || 0).toFixed(3).replace(".", ",") + " kg";

// Logo laranja vira silhueta preta (na térmica, cor sai como cinza fraco).
export function logoPreto(buf) {
  try {
    const png = PNG.sync.read(buf);
    const d = png.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 40) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255; }
      else d[i + 3] = 0;
    }
    return PNG.sync.write(png);
  } catch {
    return buf;
  }
}

// d: { nome, endereco, telefone, msg, numero, id, codigoOffline, peso, tara,
//      valor, liquido, livre, viradaLivre, antes, urlComanda, logo (Buffer|null) }
function desenhar(doc, d, qr) {
  let y = PAD;
  const centro = (txt, size, bold = false, gap = 0.6 * MM) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(txt, PAD, y, { width: W, align: "center", lineGap: 1 });
    y = doc.y + gap;
  };
  if (d.logo) {
    try { doc.image(d.logo, PAD + (W - 24 * MM) / 2, y, { fit: [24 * MM, 24 * MM], align: "center" }); y += 24 * MM + 1.5 * MM; } catch { /* sem logo */ }
  }
  centro(String(d.nome || "").toUpperCase(), 14, true);
  const linha2 = [d.endereco, d.telefone].filter(Boolean).join(" · ");
  if (linha2) centro(linha2, 9, false, 1.5 * MM);
  centro("COMANDA · BALANÇA", 9, false, 0);
  // Número grande; encolhe até caber numa linha (código OFF-xxxxxx é mais comprido).
  const num = d.codigoOffline ? d.codigoOffline : `#${d.numero}`;
  let tam = 34;
  doc.font("Helvetica-Bold");
  while (tam > 14 && doc.fontSize(tam).widthOfString(num) > W) tam -= 2;
  centro(num, tam, true, 2 * MM);

  if (Number(d.peso) > 0) {
    const col = W / 3;
    const cab = ["PESO", "TARA", "VALOR"];
    const val = [kg(d.peso), kg(d.tara), moeda(d.valor)];
    doc.font("Helvetica").fontSize(8);
    cab.forEach((c, i) => doc.text(c, PAD + col * i, y, { width: col, align: "center" }));
    y = doc.y;
    doc.font("Helvetica-Bold").fontSize(11);
    val.forEach((v, i) => doc.text(v, PAD + col * i, y, { width: col, align: "center" }));
    y = doc.y + 1 * MM;
  } else {
    centro("VALOR", 8, false, 0);
    centro(moeda(d.valor), 12, true);
  }
  if (d.livre) centro(d.viradaLivre ? "★ AGORA É BUFFET LIVRE ★" : "BUFFET LIVRE", 14, true);
  if (d.viradaLivre && d.antes != null) centro(`era ${moeda(d.antes)} por peso`, 9);

  y += 1.5 * MM;
  if (d.codigoOffline) {
    const txt = `SEM INTERNET NO MOMENTO\nGuarde este cupom — código ${d.codigoOffline}.\nA comanda entra no sistema automaticamente.`;
    doc.font("Helvetica-Bold").fontSize(10);
    const h = doc.heightOfString(txt, { width: W - 4 * MM, align: "center" }) + 4 * MM;
    doc.lineWidth(1).rect(PAD, y, W, h).stroke("#000");
    doc.text(txt, PAD + 2 * MM, y + 2 * MM, { width: W - 4 * MM, align: "center" });
    y += h + 2 * MM;
  } else if (qr) {
    const s = 42 * MM;
    doc.image(qr, PAD + (W - s) / 2, y, { width: s, height: s });
    y += s + 1.5 * MM;
  }
  centro(new Date().toLocaleString("pt-BR"), 9, false, 1 * MM);
  if (d.msg) centro(String(d.msg), 10, false, 1 * MM);

  y += 1 * MM;
  doc.lineWidth(0.8).moveTo(PAD, y).lineTo(PAD + W, y).dash(2, { space: 2 }).stroke("#000").undash();
  y += 2.5 * MM;

  // Linha do item: descrição (pode quebrar) + valor à direita; a altura é a
  // maior das duas — antes o TOTAL subia em cima quando a descrição quebrava.
  const item = Number(d.peso) > 0 ? `Buffet (${kg(d.liquido)})` : "Buffet livre (à vontade)";
  doc.font("Helvetica").fontSize(11);
  const wDesc = W * 0.62, wVal = W * 0.38;
  const hItem = Math.max(doc.heightOfString(item, { width: wDesc }), doc.heightOfString(moeda(d.valor), { width: wVal }));
  doc.text(item, PAD, y, { width: wDesc });
  doc.text(moeda(d.valor), PAD + wDesc, y, { width: wVal, align: "right" });
  y += hItem + 2 * MM;

  doc.font("Helvetica-Bold").fontSize(16);
  const hTot = doc.heightOfString("TOTAL", { width: W * 0.5 });
  doc.text("TOTAL", PAD, y, { width: W * 0.5 });
  doc.text(moeda(d.valor), PAD + W * 0.5, y, { width: W * 0.5, align: "right" });
  y += hTot + 5 * MM;
  return y;
}

export async function gerarCupomPdf(d) {
  const qr = d.codigoOffline || !d.urlComanda ? null : await QRCode.toBuffer(d.urlComanda, { margin: 1, width: 300 });
  const dados = { ...d, logo: d.logo ? logoPreto(d.logo) : null };
  // Mede a altura primeiro (página grande), depois gera na altura exata.
  const m = new PDFDocument({ size: [LARG, 3000], margin: 0 });
  const altura = desenhar(m, dados, qr);
  m.end();
  const doc = new PDFDocument({ size: [LARG, Math.max(altura, 40 * MM)], margin: 0 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const fim = new Promise((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  desenhar(doc, dados, qr);
  doc.end();
  return fim;
}
