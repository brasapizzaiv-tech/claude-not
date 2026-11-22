// Arquivo de remessa CNAB 240 pra pagar a equipe por Pix (pela CHAVE), em lote.
// Hoje: Sicoob (756), conforme o "Guia de Importação de Arquivos CNAB 240 –
// Pagamentos e Transferências" v3.5 (14/04/2026): lote 20/45 (Pagamento
// Fornecedor / Pix Transferência), segmentos A + B, câmara 009 (SPI).
// O arquivo é importado pelo próprio dono no Internet Banking, que confere e
// aprova: o sistema NUNCA paga nada sozinho.
// Sem import do resto do sistema: dá pra testar sozinho.

export type TipoChave = "telefone" | "email" | "cpf" | "cnpj" | "aleatoria";

export type ContaEmpresa = {
  cnpj: string; // só números
  nome: string;
  convenio: string;
  agencia: string;
  agenciaDv?: string | null;
  conta: string;
  contaDv: string;
};

export type ItemPix = {
  nome: string;
  valorCentavos: number;
  tipo: TipoChave;
  chave: string; // já normalizada (normalizarChave)
  cpf?: string | null; // CPF do favorecido, se tiver (só números)
  seuNumero: string; // até 20 caracteres: identifica a linha no retorno
};

const so = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

/** CPF com os dois dígitos verificadores certos. */
export function cpfValido(c: string): boolean {
  const d = so(c);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Campo numérico: só dígitos, zeros à esquerda. Erro se não couber. */
function num(v: string | number, tam: number): string {
  const d = typeof v === "number" ? String(Math.round(v)) : so(v);
  if (d.length > tam) throw new Error(`Número "${d}" não cabe em ${tam} posições.`);
  return d.padStart(tam, "0");
}

/** Campo alfanumérico: maiúsculas, sem acento, brancos à direita, corta no tamanho. */
function alfa(v: string | null | undefined, tam: number): string {
  const limpo = String(v ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .,\-/@_:+()&]/g, " ");
  return limpo.slice(0, tam).padEnd(tam, " ");
}

/** A chave vai como está (e-mail e aleatória em minúsculas, como no DICT). */
function chaveCampo(v: string, tam: number): string {
  return v.slice(0, tam).padEnd(tam, " ");
}

const brancos = (n: number) => " ".repeat(n);

function ddmmaaaa(ymd: string): string {
  const [a, m, d] = ymd.split("-");
  return `${d}${m}${a}`;
}

/** Entende o tipo e deixa a chave no formato do Pix. null = não deu pra usar. */
export function normalizarChave(tipoCadastro: string | null | undefined, chaveCadastro: string | null | undefined): { tipo: TipoChave; chave: string } | null {
  const bruta = String(chaveCadastro ?? "").trim();
  if (!bruta) return null;
  const t = String(tipoCadastro ?? "").toLowerCase();
  const d = so(bruta);
  const pareceEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bruta);
  const pareceAleatoria = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bruta);

  if (t.startsWith("e-mail") || t === "email" || (!t && pareceEmail)) {
    return pareceEmail ? { tipo: "email", chave: bruta.toLowerCase() } : null;
  }
  if (t.startsWith("chave") || (!t && pareceAleatoria)) {
    return pareceAleatoria ? { tipo: "aleatoria", chave: bruta.toLowerCase() } : null;
  }
  if (t === "cnpj" || (!t && d.length === 14 && !bruta.startsWith("+"))) {
    return d.length === 14 ? { tipo: "cnpj", chave: d } : null;
  }
  if (t === "cpf" || (!t && d.length === 11 && !bruta.startsWith("+") && cpfValido(d))) {
    return d.length === 11 ? { tipo: "cpf", chave: d } : null;
  }
  if (t === "celular" || t === "telefone" || !t) {
    // Formato do Pix: +55 + DDD + número.
    const n = d.startsWith("55") && (d.length === 12 || d.length === 13) ? d.slice(2) : d;
    return n.length === 10 || n.length === 11 ? { tipo: "telefone", chave: `+55${n}` } : null;
  }
  return null;
}

const FORMA_INICIACAO: Record<TipoChave, string> = { telefone: "01", email: "02", cpf: "03", cnpj: "03", aleatoria: "04" };

/** Monta o arquivo inteiro (linhas de 240 + CRLF). */
export function montarRemessaSicoob(conta: ContaEmpresa, itens: ItemPix[], opts: { nsa: number; dataPagamento: string; agora?: Date }): string {
  if (!itens.length) throw new Error("Nenhum pagamento no arquivo.");
  const agora = opts.agora ?? new Date();
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(agora);
  const pt = (k: string) => p.find((x) => x.type === k)?.value ?? "00";
  const dataGer = `${pt("day")}${pt("month")}${pt("year")}`;
  const horaGer = `${pt("hour") === "24" ? "00" : pt("hour")}${pt("minute")}${pt("second")}`;
  const dataPag = ddmmaaaa(opts.dataPagamento);

  const BANCO = "756";
  const cnpj = num(conta.cnpj, 14);
  const conv = alfa(conta.convenio, 20);
  const ag = num(conta.agencia, 5);
  const agDv = alfa(conta.agenciaDv || "0", 1);
  const cc = num(conta.conta, 12);
  const ccDv = num(conta.contaDv, 1);
  const nomeEmp = alfa(conta.nome, 30);

  const linhas: string[] = [];

  // Header do arquivo (registro 0).
  linhas.push(
    BANCO + "0000" + "0" + brancos(9) + "2" + cnpj + conv + ag + agDv + cc + ccDv + brancos(1) + nomeEmp +
    alfa("SICOOB", 30) + brancos(10) + "1" + dataGer + horaGer + num(opts.nsa, 6) + "087" + "01600" +
    brancos(20) + alfa("MOTELLI PIX", 20) + brancos(29),
  );

  // Header do lote (registro 1): 20 = Pagamento Fornecedor, 45 = Pix Transferência.
  linhas.push(
    BANCO + "0001" + "1" + "C" + "20" + "45" + "045" + brancos(1) + "2" + cnpj + conv + ag + agDv + cc + ccDv + brancos(1) + nomeEmp +
    brancos(40) + brancos(30) + "00000" + brancos(15) + brancos(20) + "00000" + brancos(3) + brancos(2) + "01" + brancos(6) + brancos(10),
  );

  let seq = 0;
  let soma = 0;
  for (const it of itens) {
    if (!(it.valorCentavos > 0)) throw new Error(`Valor inválido pra ${it.nome}.`);
    soma += it.valorCentavos;
    const cpf = it.tipo === "cpf" ? it.chave : so(it.cpf);
    const temCpf = cpf.length === 11;
    const temCnpj = it.tipo === "cnpj";

    // Segmento A: câmara 009 (Pix), banco/agência/conta zerados (o Pix acha pela chave).
    // Informação 2 (G031, obrigatório pro Pix): 38 brancos + tipo da conta de destino (01 = corrente).
    seq++;
    linhas.push(
      BANCO + "0001" + "3" + num(seq, 5) + "A" + "0" + "00" + "009" + "000" + "00000" + brancos(1) + "000000000000" + "0" + brancos(1) +
      alfa(it.nome, 30) + alfa(it.seuNumero, 20) + dataPag + "BRL" + num(0, 15) + num(it.valorCentavos, 15) +
      brancos(20) + "00000000" + num(0, 15) + brancos(38) + "01" + brancos(2) + "00000" + brancos(2) + brancos(3) + "0" + brancos(10),
    );

    // Segmento B: forma de iniciação (tipo da chave) + CPF/CNPJ + a chave (posição 128–226).
    seq++;
    linhas.push(
      BANCO + "0001" + "3" + num(seq, 5) + "B" + alfa(FORMA_INICIACAO[it.tipo], 3) +
      (temCnpj ? "2" + num(it.chave, 14) : temCpf ? "1" + num(cpf, 14) : "0" + num(0, 14)) +
      brancos(35) + brancos(60) + chaveCampo(it.chave, 99) + "000000" + brancos(8),
    );
  }

  // Trailer do lote (registro 5): registros do lote = header + detalhes + trailer.
  linhas.push(BANCO + "0001" + "5" + brancos(9) + num(seq + 2, 6) + num(soma, 18) + num(0, 18) + num(0, 6) + brancos(165) + brancos(10));

  // Trailer do arquivo (registro 9).
  linhas.push(BANCO + "9999" + "9" + brancos(9) + num(1, 6) + num(linhas.length + 1, 6) + num(0, 6) + brancos(205));

  for (const [i, l] of linhas.entries()) {
    if (l.length !== 240) throw new Error(`Linha ${i + 1} do arquivo saiu com ${l.length} posições (deveria ter 240).`);
  }
  return linhas.join("\r\n") + "\r\n";
}
