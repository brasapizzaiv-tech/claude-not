// Leitura da fatura do cartão de crédito.
//
// Transforma o PDF (ou CSV/TXT) da fatura numa lista de COMPRAS — cada uma com
// data, descrição e valor — pra virar um lançamento por compra, na categoria
// certa. Cada banco desenha a fatura de um jeito, então a regra é tolerante:
// procura linhas com data no começo e valor no fim, e o que sobrar de dúvida
// vai pra conferência na tela, que é onde o erro fica barato.
//
// Formato do Sicredi (conferido numa fatura real, ago/2026):
//   13/jul 23:27 Pagamento 024314977 -R$ 9.263,68      ← pagamento da anterior
//   23/jun 23:43 Online Pg Malhas Ellis 02/06 R$ 363,00
//   27/jul 08:31 Londrina Online Ll68gangclos R$ 19,90
//   27/jun 07:45 Online Paypal Scienerbxc6 4029357733   ← compra no exterior
//   Hk BRL 48,96 = US$ 0,00 R$ 0,00 R$ 48,96              quebra em 2 linhas

export type CompraFatura = {
  data: string | null;      // AAAA-MM-DD
  dataTexto: string;        // como veio na fatura ("23/06")
  descricao: string;
  valor: number;            // positivo = gasto; negativo = crédito/estorno
  parcela: string | null;   // "02/06" quando a compra é parcelada
};

export type FaturaLida = {
  compras: CompraFatura[];
  total: number;
  totalFatura: number | null;   // o "Total desta fatura" impresso no PDF
  vencimento: string | null;    // AAAA-MM-DD
  ignoradas: number;            // linhas que pareciam compra mas não deram certo
};

const MESES: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

const valorBR = (s: string) => {
  const n = Number(String(s).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// Linhas que não são compra: totais, cabeçalhos, avisos, rodapé.
const LIXO = [
  /^total/i, /^subtotal/i, /^saldo/i, /^limite/i, /^fatura/i, /^vencimento/i,
  /^resumo/i, /^encargos?\b/i, /^iof\s*$/i, /^transaç/i, /^lançamentos?$/i,
  /^data e hora/i, /^cart[ãa]o\b/i, /^legenda/i, /^p[áa]gina\s*\d/i, /^\d+ de \d+$/,
  /^pagamentos?\s*\|/i, /^despesas/i, /^utilizado/i, /^dispon[íi]vel/i,
  /^composto por/i, /^financiamento/i, /^parcelamento/i, /^pagamento (total|m[íi]nimo)/i,
  /^voc[êe] n[ãa]o possui/i, /^atualizamos/i, /^melhor dia/i, /^fechamento/i,
  /^cnpj/i, /^cpf/i, /^central de/i, /^sac\b/i, /^ouvidoria/i, /^www\./i,
  /^saque [àa]/i, /^cr[ée]dito\b/i, /^[ée] sempre a melhor/i,
];
const ehLixo = (t: string) => LIXO.some((r) => r.test(t.trim()));

// Meses entre duas datas (a de referência menos a alvo).
const mesesEntre = (anoA: number, mesA: number, anoB: number, mesB: number) =>
  (anoA - anoB) * 12 + (mesA - mesB);

// Descobre o ANO da compra. A fatura só escreve dia e mês ("09/set"), e uma
// parcela 11/12 pode ser de mais de um ano atrás. Escolhe o ano que deixa a
// compra mais perto de onde ela deveria estar: a fatura menos (parcela − 1) meses.
function anoDaCompra(mes: number, anoRef: number | null, mesRef: number | null, parcelaAtual: number): number | null {
  if (!anoRef || !mesRef) return null;
  const atrasoMeses = Math.max(0, parcelaAtual - 1);
  let melhor = anoRef;
  let menorDist = Infinity;
  for (let ano = anoRef + 1; ano >= anoRef - 5; ano--) {
    // distância (em meses) entre a data candidata e o mês esperado da compra
    const dist = Math.abs(mesesEntre(anoRef, mesRef, ano, mes) - atrasoMeses);
    if (dist < menorDist) { menorDist = dist; melhor = ano; }
  }
  return melhor;
}

// Tira da descrição o que é enfeite da fatura: hora, cidade e o marcador
// "Online"/"Presencial" que o Sicredi põe antes do nome do estabelecimento.
function limparDescricao(resto: string): string {
  let t = resto.replace(/^\d{1,2}:\d{2}\s*/, ""); // hora
  const m = t.match(/\b(online|presencial)\b\s*/i);
  if (m && (m.index ?? 99) <= 30) t = t.slice((m.index ?? 0) + m[0].length); // cidade + marcador
  // Compra no exterior arrasta a conversão ("... Hk BRL 48,96 = US$ 0,00").
  t = t.replace(/\s(?:BRL|US\$|USD)\s[\s\S]*$/i, "");
  return t.replace(/\s{2,}/g, " ").trim();
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
      if (m) vencimento = `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2]}-${m[1]}`;
    }
    if (totalFatura == null) {
      const m =
        l.match(/total\s+desta\s+fatura[^0-9-]{0,20}(-?[\d.]+,\d{2})/i) ||
        l.match(/total\s+(?:da\s+)?fatura\s+de\s+\w+[^0-9-]{0,20}(-?[\d.]+,\d{2})/i) ||
        l.match(/valor\s+total[^0-9-]{0,20}(-?[\d.]+,\d{2})/i);
      if (m) totalFatura = valorBR(m[1]);
    }
  }
  const anoRef = vencimento ? Number(vencimento.slice(0, 4)) : null;
  const mesRef = vencimento ? Number(vencimento.slice(5, 7)) : null;

  const compras: CompraFatura[] = [];
  let ignoradas = 0;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (ehLixo(linha)) continue;

    // data no começo: 23/jun · 23/06 · 23/06/26 · 23 JUN
    const mData = linha.match(/^(\d{1,2})[/ ](\d{1,2}|[a-zç]{3,})(?:[/ ](\d{2,4}))?\s+(.*)$/i);
    if (!mData) continue;
    const dia = mData[1];
    const mesBruto = mData[2].toLowerCase();
    const mes = /^\d+$/.test(mesBruto) ? mesBruto.padStart(2, "0") : (MESES[mesBruto.slice(0, 3)] ?? "");
    if (!mes || Number(mes) < 1 || Number(mes) > 12) continue;

    // Compra no exterior quebra em duas linhas: a primeira não tem valor.
    let resto = mData[4];
    let valorTexto = resto.match(/(-?\s*R?\$?\s*[\d.]{1,12},\d{2})\s*([DC])?\s*$/i);
    if (!valorTexto && i + 1 < linhas.length) {
      const proxima = linhas[i + 1];
      const naProxima = proxima.match(/(-?\s*R?\$?\s*[\d.]{1,12},\d{2})\s*$/);
      if (naProxima && !/^\d{1,2}[/ ]/.test(proxima)) {
        resto = `${resto} ${proxima}`;
        valorTexto = resto.match(/(-?\s*R?\$?\s*[\d.]{1,12},\d{2})\s*([DC])?\s*$/i);
        i++; // a linha de baixo já foi usada
      }
    }
    if (!valorTexto) { ignoradas++; continue; }

    let valor = valorBR(valorTexto[1]);
    if ((valorTexto[2] || "").toUpperCase() === "C") valor = -Math.abs(valor);
    resto = resto.slice(0, resto.length - valorTexto[0].length).trim();

    // parcela no fim: "02/06", "PARC 02/06", "02 DE 06"
    let parcela: string | null = null;
    let parcelaAtual = 1;
    const mParc = resto.match(/(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\s*$/i);
    if (mParc && Number(mParc[2]) > 1 && Number(mParc[1]) <= Number(mParc[2])) {
      parcelaAtual = Number(mParc[1]);
      parcela = `${mParc[1].padStart(2, "0")}/${mParc[2].padStart(2, "0")}`;
      resto = resto.slice(0, resto.length - mParc[0].length).trim();
    }

    const descricao = limparDescricao(resto);
    if (!descricao || descricao.length < 2) { ignoradas++; continue; }
    // O pagamento da fatura anterior aparece como lançamento — não é compra.
    if (/^(pagamento|pgto)\b/i.test(descricao)) continue;

    const anoLinha = mData[3] ? Number(mData[3].length === 2 ? `20${mData[3]}` : mData[3]) : null;
    const ano = anoLinha ?? anoDaCompra(Number(mes), anoRef, mesRef, parcelaAtual);
    compras.push({
      data: ano ? `${ano}-${mes}-${dia.padStart(2, "0")}` : null,
      dataTexto: `${dia.padStart(2, "0")}/${mes}`,
      descricao,
      valor,
      parcela,
    });
  }

  const total = Math.round(compras.reduce((s, c) => s + c.valor, 0) * 100) / 100;
  return { compras, total, totalFatura, vencimento, ignoradas };
}

// Trecho que identifica o estabelecimento, pra lembrar a categoria na próxima
// fatura ("Facebk Xd3erudf92" e "Facebk Hthkqsmf92" caem no mesmo "FACEBK").
export function chaveEstabelecimento(descricao: string): string {
  const limpo = String(descricao || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b[A-Z]*\d[A-Z0-9]*\b/g, " ") // códigos do estabelecimento (Xd3erudf92)
    .replace(/\s+/g, " ")
    .trim();
  const chave = limpo.split(" ").slice(0, 3).join(" ");
  if (chave) return chave;
  // Nome inteiro com número dentro (Ll68gangclos): usa o nome como veio.
  return String(descricao || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
}
