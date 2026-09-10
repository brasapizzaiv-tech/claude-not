import PDFDocument from "pdfkit";

const MM = 2.834645669;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type FechamentoPdfDados = {
  nome: string;              // nome do restaurante
  caixaNome: string | null;  // apelido do caixa ("DIA", "NOITE"...)
  abertoEm: string | null;   // ISO
  fechadoEm: string | null;  // ISO
  operador: string | null;   // quem fechou
  saldoInicial: number;
  vendasPorForma: [string, number][];
  totalVendas: number;
  suprimentos: number;
  sangrias: number;
  esperado: number;
  contado: number;
  quebra: number;
  obs: string | null;
};

const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : "—";

// Desenha o cupom e devolve o y final. Roda duas vezes: a primeira só pra medir
// a altura (senão sobra papel em branco antes do corte), a segunda pra valer.
function desenhar(doc: PDFKit.PDFDocument, d: FechamentoPdfDados, W: number) {
  const pad = 8;
  const contentW = W - pad * 2;
  doc.fillColor("#000");
  let y = 10;

  const centro = (txt: string, size: number, bold = false, gap = 3) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(txt, pad, y, { width: contentW, align: "center" });
    y = doc.y + gap;
  };
  const linha = () => {
    doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(1).dash(2, { space: 2 }).stroke().undash();
    y += 7;
  };
  const par = (esq: string, dir: string, bold = false, size = 10) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
    const hEsq = doc.heightOfString(esq, { width: contentW * 0.62 });
    doc.text(esq, pad, y, { width: contentW * 0.62, align: "left" });
    doc.text(dir, pad + contentW * 0.62, y, { width: contentW * 0.38, align: "right" });
    y += Math.max(hEsq, size + 2) + 3;
  };

  centro("FECHAMENTO DE CAIXA", 13, true, 2);
  centro(d.nome, 10, false, 2);
  if (d.caixaNome) centro(`Caixa: ${d.caixaNome}`, 10, true, 2);
  y += 2;
  linha();
  par("Abertura", dataHora(d.abertoEm));
  par("Fechamento", dataHora(d.fechadoEm));
  if (d.operador) par("Operador", d.operador);
  linha();

  par("Saldo inicial (troco)", brl(d.saldoInicial));
  y += 3;
  doc.font("Helvetica-Bold").fontSize(10).text("VENDAS POR FORMA", pad, y, { width: contentW });
  y = doc.y + 3;
  if (d.vendasPorForma.length === 0) par("Sem vendas", "—");
  for (const [forma, valor] of d.vendasPorForma) par(forma, brl(valor));
  par("Total de vendas", brl(d.totalVendas), true, 11);
  y += 2;
  par("Suprimentos", `+ ${brl(d.suprimentos)}`);
  par("Sangrias", `- ${brl(d.sangrias)}`);
  linha();

  par("Dinheiro esperado", brl(d.esperado), true, 11);
  par("Dinheiro contado", brl(d.contado), true, 11);
  const rotulo = Math.abs(d.quebra) < 0.005 ? "CAIXA BATEU" : d.quebra > 0 ? "SOBRA" : "FALTA";
  y += 2;
  par(rotulo, Math.abs(d.quebra) < 0.005 ? "OK" : brl(Math.abs(d.quebra)), true, 13);

  if (d.obs) {
    linha();
    doc.font("Helvetica").fontSize(9).text(`Obs.: ${d.obs}`, pad, y, { width: contentW });
    y = doc.y + 3;
  }

  linha();
  centro("Documento sem valor fiscal", 8, false, 12);
  doc.moveTo(pad + 10, y).lineTo(W - pad - 10, y).lineWidth(0.8).stroke();
  y += 4;
  centro("Conferido por", 8, false, 2);
  return y;
}

// Cupom do fechamento de caixa (Z) na térmica — mesmo caminho da NFC-e: entra
// na fila de impressão e o agente manda pra impressora, sem abrir a janela de
// impressão do navegador.
export async function gerarFechamentoPdf(d: FechamentoPdfDados, larguraMm = 80): Promise<Buffer> {
  const W = Math.min(Math.max(larguraMm || 72, 44), 110) * MM;

  // 1ª passada: só pra saber a altura exata.
  const medidor = new PDFDocument({ size: [W, 2000], margin: 0 });
  const yFinal = desenhar(medidor, d, W);
  medidor.end();

  // Página sempre mais alta que larga — deitada, a térmica gira o cupom.
  const h = Math.max(Math.ceil(yFinal + 12), W + 20);

  const doc = new PDFDocument({ size: [W, h], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (x: Buffer) => chunks.push(x));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  desenhar(doc, d, W);
  doc.end();
  return fim;
}
