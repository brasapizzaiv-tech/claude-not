// Leitura da fatura do cartão de crédito.
//
// O objetivo é transformar o PDF (ou CSV/TXT) da fatura numa lista de COMPRAS —
// cada uma com data, descrição e valor — pra virar um lançamento por compra, na
// categoria certa. A fatura de cada banco tem um desenho diferente, então aqui
// a regra é tolerante: procura linhas que tenham data + valor e deixa o resto
// pro conferido na tela, que é onde o erro fica barato.

export type CompraFatura = {
  data: string | null;      // AAAA-MM-DD (quando deu pra descobrir o ano)
  dataTexto: string;        // como veio na fatura ("12/08")
  descricao: string;
  valor: number;            // positivo = gasto; negativo = crédito/estorno
  parcela: string | null;   // "02/06" quando a compra é parcelada
};

export type FaturaLida = {
  compras: CompraFatura[];
  total: number;
  totalFatura: number | null;   // o "total desta fatura" impresso no PDF
  vencimento: string | null;    // AAAA-MM-DD
  ignoradas: number;            // linhas que pareciam compra mas não deram certo
};

const MESES: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

const valorBR = (s: string) => {
  const n = Number(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// Linhas que NÃO são compra: totais, avisos, cabeçalhos, o próprio pagamento.
const LIXO = [
  /^total/i, /^subtotal/i, /^saldo/i, /^limite/i, /^fatura/i, /^vencimento/i,
  /^pagamento\s+(efetuado|recebido|de\s+fatura)/i, /^pgto\.?\s+(fatura|efetuado)/i,
  /^encargos?\s*$/i, /^lançamentos?$/i, /^data\b.*\bvalor$/i, /^demonstrativo/i,
  /^resumo/i, /^p[áa]gina\s*\d/i, /^cnpj/i, /^cpf/i, /^central de/i, /^sac\b/i,
  /^ouvidoria/i, /^www\./i, /^compras? nacionais/i, /^compras? internacionais/i,
];
const ehLixo = (t: string) => LIXO.some((r) => r.test(t.trim()));

// Ano da fatura: o PDF nem sempre repete o ano em cada linha ("12/08"). Usa o
// ano do vencimento e volta um ano quando a compra é de dezembro numa fatura de
// janeiro.
function montarData(dia: string, mes: string, anoRef: number | null, mesRef: number | null): string | null {
  if (!anoRef) return null;
  const m = Number(mes);
  let ano = anoRef;
  if (mesRef != null && m > mesRef + 1) ano -= 1; // compra de dez na fatura de jan
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

export function lerFaturaTexto(texto: string): FaturaLida {
  const linhas = String(texto || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Vencimento e total, quando o PDF diz.
  let vencimento: string | null = null;
  let totalFatura: number | null = null;
  for (const l of linhas) {
    if (!vencimento) {
      const m = l.match(/vencimento[^0-9]{0,20}(\d{2})\/(\d{2})\/(\d{2,4})/i);
      if (m) {
        const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
        vencimento = `${ano}-${m[2]}-${m[1]}`;
      }
    }
    if (totalFatura == null) {
      const m = l.match(/total\s+(?:desta\s+)?fatura[^0-9-]{0,20}(-?[\d.]+,\d{2})/i)
        || l.match(/valor\s+total[^0-9-]{0,20}(-?[\d.]+,\d{2})/i);
      if (m) totalFatura = valorBR(m[1]);
    }
  }
  const anoRef = vencimento ? Number(vencimento.slice(0, 4)) : null;
  const mesRef = vencimento ? Number(vencimento.slice(5, 7)) : null;

  const compras: CompraFatura[] = [];
  let ignoradas = 0;

  for (const linha of linhas) {
    if (ehLixo(linha)) continue;
    // data no começo: 12/08 · 12/08/26 · 12 AGO
    const mData = linha.match(/^(\d{1,2})[/ ](\d{1,2}|[a-zç]{3})(?:[/ ](\d{2,4}))?\s+(.*)$/i);
    if (!mData) continue;
    const dia = mData[1];
    const mesBruto = mData[2].toLowerCase();
    const mes = /^\d+$/.test(mesBruto) ? mesBruto : (MESES[mesBruto.slice(0, 3)] ?? "");
    if (!mes) continue;
    let resto = mData[4];

    // valor no fim (aceita "123,45", "-123,45", "123,45 D", "R$ 123,45")
    const mValor = resto.match(/(-?\s?R?\$?\s?[\d.]{1,12},\d{2})\s*([DC])?\s*$/i);
    if (!mValor) { ignoradas++; continue; }
    let valor = valorBR(mValor[1].replace(/[R$\s]/g, ""));
    // marcação de crédito: "C" no fim, ou sinal de menos
    if ((mValor[2] || "").toUpperCase() === "C") valor = -Math.abs(valor);
    resto = resto.slice(0, resto.length - mValor[0].length).trim();

    // parcela no fim da descrição: "02/06", "PARC 02/06", "02 DE 06"
    let parcela: string | null = null;
    const mParc = resto.match(/(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\s*$/i);
    if (mParc && Number(mParc[2]) > 1 && Number(mParc[1]) <= Number(mParc[2])) {
      parcela = `${mParc[1].padStart(2, "0")}/${mParc[2].padStart(2, "0")}`;
      resto = resto.slice(0, resto.length - mParc[0].length).trim();
    }

    const descricao = resto.replace(/\s{2,}/g, " ").trim();
    if (!descricao || descricao.length < 2) { ignoradas++; continue; }
    const ano = mData[3] ? (mData[3].length === 2 ? `20${mData[3]}` : mData[3]) : null;
    compras.push({
      data: ano ? `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}` : montarData(dia, mes, anoRef, mesRef),
      dataTexto: `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}`,
      descricao,
      valor,
      parcela,
    });
  }

  const total = Math.round(compras.reduce((s, c) => s + c.valor, 0) * 100) / 100;
  return { compras, total, totalFatura, vencimento, ignoradas };
}

// Trecho que identifica o estabelecimento, pra lembrar a categoria na próxima
// fatura ("POSTO IPIRANGA IVOTI 12/08" e "POSTO IPIRANGA IVOTI" viram a mesma
// chave). Tira números, parcelas e cidade colada no fim.
export function chaveEstabelecimento(descricao: string): string {
  return String(descricao || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}
