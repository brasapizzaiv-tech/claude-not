// FERIADOS E DATAS ESPECIAIS
//
// Regras puras: sem React e sem banco, porque isto é lido pela tela do painel,
// pela TV da cozinha e pelo mural do escritório — e os três têm que dizer a
// mesma coisa.

export type SituacaoFeriado = "indefinido" | "abre" | "fecha" | "especial";

export type Feriado = {
  id: string;
  data: string; // AAAA-MM-DD
  nome: string;
  situacao: SituacaoFeriado;
  detalhe: string | null;
};

/** Como cada situação aparece nas telas. O rótulo é curto de propósito: numa TV
 *  vista de 4 metros, "ABRE" e "FECHA" se leem de relance; frase não. */
export const SITUACAO: Record<SituacaoFeriado, { curto: string; longo: string; cor: string }> = {
  indefinido: { curto: "A DEFINIR", longo: "Ainda não decidido", cor: "#e8836c" },
  abre: { curto: "ABRE", longo: "Abre normal", cor: "#9dbd7c" },
  fecha: { curto: "FECHA", longo: "Fechado", cor: "#9b8878" },
  especial: { curto: "ESPECIAL", longo: "Abre diferente", cor: "#C78340" },
};

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** "Seg, 12/10" — o dia da semana vem junto porque é o que decide a escala. */
export function rotuloDoDia(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return `${DIAS[d.getDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Dias entre duas datas em AAAA-MM-DD, sem passar por fuso. */
export function diasAte(de: string, ate: string) {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((+new Date(a2, m2 - 1, d2) - +new Date(a1, m1 - 1, d1)) / 86400000);
}

/** "hoje", "amanhã", "em 12 dias". */
export function quandoE(hoje: string, data: string) {
  const n = diasAte(hoje, data);
  if (n <= 0) return "hoje";
  if (n === 1) return "amanhã";
  return `em ${n} dias`;
}

/** Os que vêm aí, do mais próximo pro mais distante. */
export function proximos(lista: Feriado[], hoje: string, dias = 120, quantos = 4) {
  const limite = somarDias(hoje, dias);
  return lista
    .filter((f) => f.data >= hoje && f.data <= limite)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, quantos);
}

export function somarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

// ---------------------------------------------------------------------------
// O CALENDÁRIO OFICIAL
//
// Serve pra oferecer as datas prontas, pro Rafael só dizer abre ou fecha em vez
// de digitar treze datas por ano. Só as nacionais e a do Rio Grande do Sul: as
// municipais de Ivoti eu não sei de cor, e chutar data de feriado é pior do que
// deixar em branco — ele acrescenta na mão.
// ---------------------------------------------------------------------------

/** Domingo de Páscoa do ano (algoritmo de Meeus/Butcher). É dele que saem o
 *  Carnaval, a Sexta-feira Santa e o Corpus Christi, que mudam todo ano. */
export function pascoa(ano: number) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Os feriados de um ano: fixos + os que dependem da Páscoa. */
export function feriadosDoAno(ano: number): { data: string; nome: string }[] {
  const p = pascoa(ano);
  return [
    { data: `${ano}-01-01`, nome: "Confraternização Universal" },
    { data: somarDias(p, -48), nome: "Carnaval (segunda)" },
    { data: somarDias(p, -47), nome: "Carnaval" },
    { data: somarDias(p, -2), nome: "Sexta-feira Santa" },
    { data: `${ano}-04-21`, nome: "Tiradentes" },
    { data: `${ano}-05-01`, nome: "Dia do Trabalho" },
    { data: somarDias(p, 60), nome: "Corpus Christi" },
    { data: `${ano}-09-07`, nome: "Independência do Brasil" },
    { data: `${ano}-09-20`, nome: "Revolução Farroupilha (RS)" },
    { data: `${ano}-10-12`, nome: "Nossa Senhora Aparecida" },
    { data: `${ano}-11-02`, nome: "Finados" },
    { data: `${ano}-11-15`, nome: "Proclamação da República" },
    { data: `${ano}-11-20`, nome: "Consciência Negra" },
    { data: `${ano}-12-25`, nome: "Natal" },
  ].sort((a, b) => a.data.localeCompare(b.data));
}

/** O calendário oficial de `hoje` até `meses` à frente, já sem o que passou. */
export function calendarioOficial(hoje: string, meses = 18) {
  const ano = Number(hoje.slice(0, 4));
  const limite = somarDias(hoje, Math.round(meses * 30.5));
  return [...feriadosDoAno(ano), ...feriadosDoAno(ano + 1), ...feriadosDoAno(ano + 2)]
    .filter((f) => f.data >= hoje && f.data <= limite);
}
