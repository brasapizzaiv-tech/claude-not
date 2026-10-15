"use client";

// Cartão do vale-presente desenhado no navegador (canvas): a MESMA arte vira a
// imagem pro WhatsApp e o cartão de imprimir (A6, ou centralizado numa A4 com
// marcas de corte). Proporção A6 deitado (148 × 105 mm). Cores da marca Brasa:
// laranja #C78340, escuro #211915, branco.
import QRCode from "qrcode";
import { dataBR, formatarCodigo, type ValeCartao } from "@/lib/vale-presente";

const W = 1480, H = 1050;
const ESCURO = "#211915", LARANJA = "#C78340", CREME = "#efe4d6", APAGADO = "#a8927d";

const valorCurto = (n: number) =>
  Number.isInteger(n) ? `R$ ${n.toLocaleString("pt-BR")}` : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function carregar(src: string) {
  return new Promise<HTMLImageElement | null>((ok) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    i.src = src;
  });
}

function quebrar(ctx: CanvasRenderingContext2D, texto: string, largura: number, max: number) {
  const linhas: string[] = [];
  let atual = "";
  for (const p of texto.split(/\s+/).filter(Boolean)) {
    const t = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(t).width <= largura) atual = t;
    else { if (atual) linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  if (linhas.length > max) { linhas.length = max; linhas[max - 1] = linhas[max - 1].replace(/\s*\S*$/, "…"); }
  return linhas;
}

// Letra que cabe: diminui até o texto caber na largura.
function caber(ctx: CanvasRenderingContext2D, texto: string, fonte: (px: number) => string, px: number, largura: number) {
  let t = px;
  ctx.font = fonte(t);
  while (t > 20 && ctx.measureText(texto).width > largura) { t -= 4; ctx.font = fonte(t); }
  return t;
}

export async function desenharCartaoVale(v: ValeCartao): Promise<HTMLCanvasElement> {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  const serif = (px: number, peso = "700", estilo = "normal") => `${estilo} ${peso} ${px}px Georgia, "Times New Roman", serif`;
  const sans = (px: number, peso = "400") => `${peso} ${px}px "Segoe UI", Arial, sans-serif`;
  const mono = (px: number) => `700 ${px}px Consolas, "Courier New", monospace`;

  // fundo e moldura
  ctx.fillStyle = ESCURO; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LARANJA; ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, W - 72, H - 72);

  // topo: logo + título
  const logo = await carregar("/logo-brasa-branco.png");
  if (logo) ctx.drawImage(logo, 76, 56, 220, 220);
  ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = LARANJA; ctx.font = serif(64, "400", "italic");
  ctx.fillText("Vale-presente", W - 92, 150);
  ctx.fillStyle = APAGADO; ctx.font = sans(26);
  ctx.fillText("Brasa Restaurante e Pizzaria", W - 92, 196);

  // valor
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  caber(ctx, valorCurto(v.valor), (px) => serif(px, "700"), 200, W - 190);
  ctx.fillText(valorCurto(v.valor), 92, 450);

  // para / de / recado
  let y = 530;
  if (v.para) {
    ctx.fillStyle = CREME; caber(ctx, `Para ${v.para}`, (px) => serif(px, "400"), 52, W - 190);
    ctx.fillText(`Para ${v.para}`, 92, y); y += 52;
  }
  if (v.de) {
    ctx.fillStyle = LARANJA; caber(ctx, `com carinho de ${v.de}`, (px) => sans(px), 32, W - 190);
    ctx.fillText(`com carinho de ${v.de}`, 92, y); y += 46;
  }
  if (v.mensagem) {
    ctx.fillStyle = CREME; ctx.font = serif(30, "400", "italic");
    for (const l of quebrar(ctx, `“${v.mensagem}”`, W - 190, 2)) { ctx.fillText(l, 92, y + 8); y += 40; }
  }

  // canhoto: linha tracejada, código, validade e QR
  const topo = 760;
  ctx.setLineDash([14, 12]); ctx.strokeStyle = LARANJA; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(36, topo); ctx.lineTo(W - 36, topo); ctx.stroke(); ctx.setLineDash([]);

  ctx.fillStyle = APAGADO; ctx.font = sans(24, "600");
  ctx.fillText("CÓDIGO DO VALE", 92, topo + 62);
  ctx.fillStyle = LARANJA; ctx.font = mono(86);
  ctx.fillText(formatarCodigo(v.codigo), 88, topo + 152);
  ctx.fillStyle = CREME; ctx.font = sans(26);
  ctx.fillText(`Válido até ${dataBR(v.validade)} · pode usar aos poucos até acabar o saldo`, 92, topo + 202);
  ctx.fillStyle = APAGADO; ctx.font = sans(20);
  ctx.fillText("Av. Presidente Lucena, 1243 · Ivoti/RS · apresente o código no caixa", 92, topo + 236);

  const q = 210;
  const qx = W - 92 - q, qy = topo + 34;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(qx - 12, qy - 12, q + 24, q + 24);
  const qrUrl = await QRCode.toDataURL(v.codigo, { errorCorrectionLevel: "M", margin: 0, width: q * 2, color: { dark: ESCURO, light: "#ffffff" } });
  const qr = await carregar(qrUrl);
  if (qr) ctx.drawImage(qr, qx, qy, q, q);

  return cv;
}

export async function cartaoValePng(v: ValeCartao): Promise<Blob> {
  const cv = await desenharCartaoVale(v);
  return new Promise((ok, erro) => cv.toBlob((b) => (b ? ok(b) : erro(new Error("sem imagem"))), "image/png"));
}

/** Abre o cartão numa aba pra imprimir: "a6" (o cartão do tamanho do papel) ou "a4" (centralizado, com marcas de corte). */
export async function imprimirCartaoVale(v: ValeCartao, papel: "a6" | "a4", janela: Window) {
  const url = (await desenharCartaoVale(v)).toDataURL("image/png");
  const a6 = papel === "a6";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Vale-presente ${formatarCodigo(v.codigo)}</title><style>
    @page { size: ${a6 ? "148mm 105mm" : "A4 portrait"}; margin: 0 }
    html, body { margin: 0; padding: 0; background: #fff }
    .folha { ${a6 ? "width:148mm;height:105mm" : "width:210mm;height:297mm;display:flex;align-items:center;justify-content:center"} }
    .corte { position: relative; width: 148mm; height: 105mm; ${a6 ? "" : "outline: 0.2mm dashed #bbb; outline-offset: 0"} }
    img { display: block; width: 148mm; height: 105mm; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  </style></head><body><div class="folha"><div class="corte"><img src="${url}" alt="Vale-presente"></div></div>
  <scr${""}ipt>window.onload=function(){setTimeout(function(){window.print();},200);}</scr${""}ipt></body></html>`;
  janela.document.open();
  janela.document.write(html);
  janela.document.close();
}
