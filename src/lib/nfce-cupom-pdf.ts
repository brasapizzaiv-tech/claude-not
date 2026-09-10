import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { PNG } from "pngjs";

// Cupom da NFC-e (DANFE simplificado) gerado por nós, a partir do XML autorizado.
//
// Por que não usamos o "DANFE" do Focus: para NFC-e eles devolvem uma PÁGINA
// HTML, não um PDF (pedir .pdf responde 406). O agente salvava esse HTML como
// .pdf e a impressora não abria — os cupons ficavam presos na fila tentando pra
// sempre. Com o XML (mesma URL sem a extensão) montamos o cupom aqui, no mesmo
// formato dos outros documentos: 80 mm, retrato, altura medida.

const MM = 2.834645669;

const tag = (xml: string, t: string) => {
  const m = xml.match(new RegExp(`<${t}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${t}>`));
  return m ? m[1].trim() : "";
};
const dentro = (xml: string, t: string) => {
  const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));
  return m ? m[1] : "";
};
const n2 = (s: string) => Number(String(s).replace(",", ".")) || 0;
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = (s: string) => {
  const v = n2(s);
  return Number.isInteger(v) ? String(v) : v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

// tPag da NFC-e → nome que o cliente entende.
const PAGAMENTO: Record<string, string> = {
  "01": "Dinheiro", "02": "Cheque", "03": "Cartão de crédito", "04": "Cartão de débito",
  "05": "Crédito loja", "10": "Vale alimentação", "11": "Vale refeição", "12": "Vale presente",
  "13": "Vale combustível", "15": "Boleto", "16": "Depósito", "17": "Pix",
  "18": "Carteira digital", "19": "Cashback", "90": "Sem pagamento", "99": "Outros",
};

const cnpjBonito = (s: string) =>
  s.length === 14 ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : s;
const cpfBonito = (s: string) =>
  s.length === 11 ? s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : s;
const chaveBonita = (s: string) => (s.match(/.{1,4}/g) ?? [s]).join(" ");
const dataBonita = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

type Item = { n: string; cod: string; desc: string; qtd: string; un: string; unit: string; total: string };

// A logo da Brasa é LARANJA: na térmica o laranja sai cinza fraco. Aqui ela
// vira silhueta preta e encolhe (o arquivo original tem 3000 px — desenhar
// isso a cada cupom seria desperdício). O resultado fica guardado em memória.
let logoCache: Buffer | null = null;
export function logoParaCupom(buf: Buffer, larguraAlvo = 320): Buffer | null {
  if (logoCache) return logoCache;
  try {
    const src = PNG.sync.read(buf);
    const W = Math.min(larguraAlvo, src.width);
    const H = Math.max(1, Math.round(src.height * (W / src.width)));
    const out = new PNG({ width: W, height: H });
    const px = src.width / W, py = src.height / H;
    for (let y = 0; y < H; y++) {
      const y0 = Math.floor(y * py), y1 = Math.max(y0 + 1, Math.floor((y + 1) * py));
      for (let x = 0; x < W; x++) {
        const x0 = Math.floor(x * px), x1 = Math.max(x0 + 1, Math.floor((x + 1) * px));
        let alpha = 0, n = 0;
        for (let sy = y0; sy < y1 && sy < src.height; sy++) {
          for (let sx = x0; sx < x1 && sx < src.width; sx++) {
            alpha += src.data[(sy * src.width + sx) * 4 + 3];
            n++;
          }
        }
        const o = (y * W + x) * 4;
        out.data[o] = 0; out.data[o + 1] = 0; out.data[o + 2] = 0;
        out.data[o + 3] = n > 0 ? Math.round(alpha / n) : 0;
      }
    }
    logoCache = PNG.sync.write(out);
    return logoCache;
  } catch {
    return null;
  }
}

function lerXml(xml: string) {
  const emit = dentro(xml, "emit");
  const ender = dentro(emit, "enderEmit");
  const ide = dentro(xml, "ide");
  const total = dentro(dentro(xml, "total"), "ICMSTot");
  const dest = dentro(xml, "dest");
  const prot = dentro(dentro(xml, "protNFe"), "infProt");

  const itens: Item[] = [...xml.matchAll(/<det nItem="(\d+)">([\s\S]*?)<\/det>/g)].map(([, n, body]) => {
    const p = dentro(body, "prod");
    return {
      n, cod: tag(p, "cProd"), desc: tag(p, "xProd"),
      qtd: tag(p, "qCom"), un: tag(p, "uCom"),
      unit: tag(p, "vUnCom"), total: tag(p, "vProd"),
    };
  });

  const pagamentos = [...xml.matchAll(/<detPag>([\s\S]*?)<\/detPag>/g)].map(([, body]) => ({
    forma: PAGAMENTO[tag(body, "tPag")] ?? "Outros",
    valor: n2(tag(body, "vPag")),
  }));

  return {
    emitente: tag(emit, "xNome"),
    fantasia: tag(emit, "xFant"),
    cnpj: tag(emit, "CNPJ"),
    ie: tag(emit, "IE"),
    endereco: [tag(ender, "xLgr"), tag(ender, "nro"), tag(ender, "xBairro")].filter(Boolean).join(", "),
    cidade: [tag(ender, "xMun"), tag(ender, "UF")].filter(Boolean).join(" - "),
    numero: tag(ide, "nNF"),
    serie: tag(ide, "serie"),
    emissao: tag(ide, "dhEmi"),
    itens,
    totalProdutos: n2(tag(total, "vProd")),
    desconto: n2(tag(total, "vDesc")),
    totalNota: n2(tag(total, "vNF")),
    tributos: n2(tag(total, "vTotTrib")),
    troco: n2(tag(dentro(xml, "pag"), "vTroco")),
    pagamentos,
    cpfDest: tag(dest, "CPF"),
    cnpjDest: tag(dest, "CNPJ"),
    nomeDest: tag(dest, "xNome"),
    chave: tag(prot, "chNFe") || (xml.match(/Id="NFe(\d{44})"/) || [])[1] || "",
    protocolo: tag(prot, "nProt"),
    protocoloEm: tag(prot, "dhRecbto"),
    qrCode: tag(xml, "qrCode"),
    urlChave: tag(xml, "urlChave"),
    contingencia: tag(ide, "tpEmis") !== "1",
    homologacao: tag(ide, "tpAmb") === "2",
  };
}
export type NfceCupom = ReturnType<typeof lerXml>;

function desenhar(doc: PDFKit.PDFDocument, d: NfceCupom, W: number, qrPng: Buffer | null, logo: Buffer | null) {
  const pad = 7;
  const cw = W - pad * 2;
  doc.fillColor("#000");
  let y = 8;

  const centro = (txt: string, size: number, bold = false, gap = 2) => {
    if (!txt) return;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(txt, pad, y, { width: cw, align: "center" });
    y = doc.y + gap;
  };
  const esq = (txt: string, size = 9, bold = false, gap = 2) => {
    if (!txt) return;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(txt, pad, y, { width: cw });
    y = doc.y + gap;
  };
  const linha = () => {
    doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(0.7).dash(2, { space: 2 }).stroke().undash();
    y += 5;
  };
  const par = (a: string, b: string, size = 10, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
    doc.text(a, pad, y, { width: cw * 0.62 });
    doc.text(b, pad + cw * 0.62, y, { width: cw * 0.38, align: "right" });
    y += size + 3;
  };

  // ---------- emitente ----------
  if (logo) {
    try {
      const lado = Math.min(cw * 0.42, 26 * MM);
      doc.image(logo, pad + (cw - lado) / 2, y, { width: lado, height: lado });
      y += lado + 3;
    } catch { /* segue sem a logo */ }
  }
  centro(d.fantasia || d.emitente, 13, true, 2);
  if (d.fantasia && d.emitente && d.fantasia !== d.emitente) centro(d.emitente, 8.5, false, 1);
  centro(`CNPJ ${cnpjBonito(d.cnpj)}${d.ie ? ` · IE ${d.ie}` : ""}`, 8, false, 1);
  centro(d.endereco, 8, false, 1);
  centro(d.cidade, 8, false, 4);
  linha();
  centro("DANFE NFC-e", 12, true, 1);
  centro("Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica", 7.5, false, 4);
  if (d.homologacao) centro("*** SEM VALOR FISCAL — HOMOLOGAÇÃO ***", 10, true, 4);
  if (d.contingencia) centro("*** EMITIDA EM CONTINGÊNCIA ***", 10, true, 4);
  linha();

  // ---------- itens ----------
  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("COD  DESCRIÇÃO", pad, y, { width: cw * 0.55 });
  doc.text("QTD x UNIT", pad + cw * 0.55, y, { width: cw * 0.25, align: "right" });
  doc.text("TOTAL", pad + cw * 0.8, y, { width: cw * 0.2, align: "right" });
  y = doc.y + 2;
  linha();
  for (const it of d.itens) {
    doc.font("Helvetica").fontSize(10);
    const desc = `${it.n}  ${it.desc}`;
    const h = doc.heightOfString(desc, { width: cw });
    doc.text(desc, pad, y, { width: cw });
    y += h;
    // quantidade à esquerda (recuada) e total à direita, na mesma linha
    doc.fontSize(9.5).text(`${qtd(it.qtd)} ${it.un} x ${brl(n2(it.unit))}`, pad + 12, y, { width: cw * 0.6 });
    doc.font("Helvetica-Bold").fontSize(10).text(brl(n2(it.total)), pad + cw * 0.6, y, { width: cw * 0.4, align: "right" });
    y += 14;
  }
  linha();

  // ---------- totais ----------
  par("Qtd. total de itens", String(d.itens.length), 10);
  par("Valor total", `R$ ${brl(d.totalProdutos)}`, 10);
  if (d.desconto > 0.004) par("Desconto", `- R$ ${brl(d.desconto)}`, 10);
  par("VALOR A PAGAR", `R$ ${brl(d.totalNota)}`, 14, true);
  y += 1;
  for (const p of d.pagamentos) par(p.forma, `R$ ${brl(p.valor)}`, 10);
  if (d.troco > 0.004) par("Troco", `R$ ${brl(d.troco)}`, 10);
  if (d.tributos > 0.004) {
    esq(`Tributos aprox. R$ ${brl(d.tributos)} — Lei 12.741/2012`, 7.5, false, 2);
  }
  linha();

  // ---------- consulta / chave ----------
  centro("Consulte pela Chave de Acesso em", 8.5, false, 1);
  centro(d.urlChave || "www.sefaz.rs.gov.br/nfce/consulta", 8.5, true, 4);
  centro(chaveBonita(d.chave), 9, false, 5);

  // ---------- consumidor ----------
  if (d.cpfDest) centro(`CONSUMIDOR — CPF ${cpfBonito(d.cpfDest)}`, 10, true, 1);
  else if (d.cnpjDest) centro(`CONSUMIDOR — CNPJ ${cnpjBonito(d.cnpjDest)}`, 10, true, 1);
  else centro("CONSUMIDOR NÃO IDENTIFICADO", 10, true, 1);
  if (d.nomeDest) centro(d.nomeDest, 8.5, false, 1);
  y += 2;
  centro(`NFC-e nº ${d.numero}  Série ${d.serie}  ${dataBonita(d.emissao)}`, 8.5, false, 4);
  if (d.protocolo) centro(`Protocolo de autorização: ${d.protocolo}`, 8.5, false, 1);
  if (d.protocoloEm) centro(dataBonita(d.protocoloEm), 8.5, false, 4);

  // ---------- QR ----------
  if (qrPng) {
    const lado = Math.min(cw * 0.62, 46 * MM);
    doc.image(qrPng, pad + (cw - lado) / 2, y, { width: lado, height: lado });
    y += lado + 3;
  }
  centro("Obrigado pela preferência!", 9.5, false, 2);
  return y;
}

// Gera o cupom a partir do XML autorizado da NFC-e.
export async function gerarNfceCupomPdf(xml: string, larguraMm = 80, logoPng?: Buffer | null): Promise<Buffer> {
  const d = lerXml(xml);
  const W = Math.min(Math.max(larguraMm || 72, 44), 110) * MM;

  let qrPng: Buffer | null = null;
  if (d.qrCode) {
    try {
      qrPng = await QRCode.toBuffer(d.qrCode, { type: "png", errorCorrectionLevel: "M", margin: 1, scale: 6 });
    } catch { /* sem QR, o cupom sai com a chave por extenso */ }
  }

  const logo = logoPng ? logoParaCupom(logoPng) : null;

  // Duas passadas: a primeira só mede a altura, pra não sobrar papel.
  const medidor = new PDFDocument({ size: [W, 4000], margin: 0 });
  const yFinal = desenhar(medidor, d, W, qrPng, logo);
  medidor.end();
  const h = Math.max(Math.ceil(yFinal + 10), W + 20);

  const doc = new PDFDocument({ size: [W, h], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (x: Buffer) => chunks.push(x));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  desenhar(doc, d, W, qrPng, logo);
  doc.end();
  return fim;
}
