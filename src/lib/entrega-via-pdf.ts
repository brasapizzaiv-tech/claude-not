// Via de ENTREGA (sai na impressora do caixa — a que recebe a NFC-e): o papel
// que vai com o motoboy ou fica no balcão na retirada. Igual à "folha do caixa"
// do sistema antigo (27/11/2026): pedido, agendado, cliente, endereço, itens
// com valor, total, pagamento/troco e o QR que o app do motoboy lê. A comanda
// da cozinha saiu sem o QR.
import PDFDocument from "pdfkit";
import { linhasComSabores } from "@/lib/sabores-linhas";
import QRCode from "qrcode";

const MM = 2.834645669;
const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type ViaEntrega = {
  numero: number | null;
  tipo: "entrega" | "retirada";
  agendadoPara: string | null; // "11:25"
  /** Pedido editado depois de lançado: "19:42" (sai "PEDIDO ALTERADO" no topo). */
  alterado?: string | null;
  pedidoEm: string;            // "27/11 10:03"
  origem: string;
  nome: string;
  telefone: string | null;
  endereco: string | null;
  referencia: string | null;
  itens: { qtd: number; descricao: string; preco: number }[];
  taxa: number;
  desconto: number;
  descontoMotivo: string | null;
  forma: string | null;
  trocoPara: number | null;
  pago: boolean;
  observacao: string | null;
  qr: string | null;
};

export async function gerarViaEntregaPdf(d: ViaEntrega, larguraMm = 80): Promise<Buffer> {
  const W = larguraMm * MM;
  const pad = 10; // margem maior: o caixa cortava a última letra da direita
  const cw = W - pad * 2;
  let h = 330 + (d.qr ? 110 : 0) + (d.alterado ? 40 : 0);
  for (const it of d.itens) h += 24 + (linhasComSabores(it.descricao).length - 1) * 15;
  if (d.observacao) h += 30;
  const doc = new PDFDocument({ size: [W, Math.max(h, W + 20)], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (x: Buffer) => chunks.push(x));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  doc.fillColor("#000");
  let y = 8;
  const linha = () => { doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(1).dash(2, { space: 2 }).stroke().undash(); y += 7; };
  // Destaque em MOLDURA (não faixa preta): área grande preenchida sai rajada e
  // apagada no térmico quando vai como PDF (27/11/2026).
  const faixa = (texto: string, tam = 12) => {
    doc.font("Helvetica-Bold").fontSize(tam + 1);
    const alt = doc.heightOfString(texto, { width: cw - 8 }) + 6;
    doc.rect(pad + 1, y, cw - 2, alt).lineWidth(2).stroke("#000");
    doc.fillColor("#000").text(texto, pad + 4, y + 3, { width: cw - 8, align: "center" });
    y += alt + 5;
  };

  if (d.alterado) faixa(`PEDIDO ALTERADO ÀS ${d.alterado}\nVALE ESTA VIA`, 12);
  doc.font("Helvetica-Bold").fontSize(18).text(d.tipo === "entrega" ? "ENTREGAR" : "RETIRADA NO BALCÃO", pad, y, { width: cw, align: "center" });
  y = doc.y + 2;
  doc.font("Helvetica-Bold").fontSize(22).text(`PEDIDO ${d.numero ?? "—"}`, pad, y, { width: cw, align: "center" });
  y = doc.y + 4;
  if (d.agendadoPara) faixa(`AGENDADO PARA ${d.agendadoPara}`, 13);
  doc.font("Helvetica-Bold").fontSize(10).text(`Pedido às ${d.pedidoEm} · ${d.origem}`, pad, y, { width: cw });
  y = doc.y + 4; linha();

  doc.font("Helvetica-Bold").fontSize(12).text(d.nome, pad, y, { width: cw });
  y = doc.y;
  if (d.telefone) { doc.font("Helvetica-Bold").fontSize(11).text(`Fone: ${d.telefone}`, pad, y, { width: cw }); y = doc.y; }
  if (d.endereco) { doc.font("Helvetica-Bold").fontSize(11).text(d.endereco, pad, y, { width: cw }); y = doc.y; }
  if (d.referencia) { doc.font("Helvetica-Bold").fontSize(10).text(`Ref.: ${d.referencia}`, pad, y, { width: cw }); y = doc.y; }
  y += 4; linha();

  let subtotal = 0;
  for (const it of d.itens) {
    const [nome, ...resto] = linhasComSabores(it.descricao); // um sabor por linha
    const valor = it.preco * it.qtd;
    subtotal += valor;
    const q = Number.isInteger(it.qtd) ? `${it.qtd}x ` : "";
    // Nome comprido (combo) quebra: a próxima linha começa depois dele, não do valor.
    doc.font("Helvetica-Bold").fontSize(11);
    const altNome = doc.heightOfString(`${q}${nome}`, { width: cw - 58 });
    doc.text(`${q}${nome}`, pad, y, { width: cw - 58 });
    doc.text(brl(valor), W - pad - 55, y, { width: 55, align: "right" });
    y += Math.max(altNome, 13) + 1;
    for (const l of resto) {
      if (l.startsWith("» ")) {
        // Etapa em moldura (igual à comanda da cozinha).
        y += 2;
        const tit = l.slice(2).toUpperCase();
        doc.font("Helvetica-Bold").fontSize(10);
        const wT = Math.min(cw - 6, doc.widthOfString(tit) + 10);
        const hT = doc.heightOfString(tit, { width: wT - 8 }) + 3;
        doc.rect(pad + 4, y, wT, hT).lineWidth(1.3).stroke("#000");
        doc.text(tit, pad + 8, y + 2, { width: wT - 8 });
        y += hT + 2;
        continue;
      }
      doc.font("Helvetica-Bold").fontSize(10).text(`     ${l.replace(/^-\s*/, "")}`, pad, y, { width: cw });
      y = doc.y;
    }
    y += 3;
  }
  linha();

  // Rótulo à esquerda (pode quebrar) e valor à direita: a próxima linha começa
  // depois do MAIS ALTO dos dois (o "Desconto (Cupom X)" em 3 linhas ficava
  // por baixo do TOTAL — 27/11/2026).
  const par = (rot: string, val: string, _forte = false, tam = 11) => {
    doc.font("Helvetica-Bold").fontSize(tam);
    const wVal = Math.min(cw * 0.45, doc.widthOfString(val) + 4);
    const wRot = cw - wVal - 4;
    const altRot = doc.heightOfString(rot, { width: wRot });
    const altVal = doc.heightOfString(val, { width: wVal });
    doc.text(rot, pad, y, { width: wRot });
    doc.text(val, pad + cw - wVal, y, { width: wVal, align: "right" });
    y += Math.max(altRot, altVal) + 1;
  };
  par("Produtos", brl(subtotal));
  if (d.tipo === "entrega") par("Entrega", d.taxa > 0 ? brl(d.taxa) : "GRÁTIS");
  if (d.desconto > 0) par(d.descontoMotivo ? (/^cupom/i.test(d.descontoMotivo) ? d.descontoMotivo : `Desconto (${d.descontoMotivo})`) : "Desconto", `-${brl(d.desconto)}`);
  const total = Math.max(0, subtotal + (d.tipo === "entrega" ? d.taxa : 0) - d.desconto);
  y += 2;
  par("TOTAL", `R$ ${brl(total)}`, true, 16);
  y += 2;
  if (d.forma) par(d.forma, brl(total));
  if (d.trocoPara && d.trocoPara > total) par(`Troco pra ${brl(d.trocoPara)}`, `levar ${brl(d.trocoPara - total)}`, true);
  y += 2;
  faixa(d.pago ? "PEDIDO PAGO" : "A RECEBER NA ENTREGA", 12);
  if (d.observacao) { doc.font("Helvetica-Bold").fontSize(11).text(`Obs.: ${d.observacao}`, pad, y, { width: cw }); y = doc.y + 4; }

  if (d.qr) {
    linha();
    try {
      const png = await QRCode.toBuffer(d.qr, { type: "png", errorCorrectionLevel: "M", margin: 1, scale: 4 });
      const lado = 85;
      doc.image(png, pad + (cw - lado) / 2, y, { width: lado, height: lado });
      y += lado + 2;
      doc.font("Helvetica-Bold").fontSize(8.5).text(`Motoboy: leia no app pra pegar a entrega #${d.numero ?? ""}`, pad, y, { width: cw, align: "center" });
      y = doc.y + 4;
    } catch { /* sem QR */ }
  }
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000").text("Brasa · via de entrega", pad, y, { width: cw, align: "center" });
  doc.end();
  return fim;
}
