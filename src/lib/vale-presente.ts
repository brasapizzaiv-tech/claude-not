// Vale-presente com código (migration 0235): regras que valem na tela e no
// servidor. O código é de 8 letras/números sem os que confundem (0/O, 1/I/L),
// guardado sem traço e mostrado em dois blocos: "K7P2-M9QX".

export const VALIDADE_MESES = 3;

const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Código novo (aleatório de verdade, do crypto). */
export function gerarCodigoVale(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

/** O que a pessoa digitou (com traço, espaço, minúscula) → como está no banco. */
export function normalizarCodigo(txt: string | null | undefined): string {
  return String(txt ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

export const formatarCodigo = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

/** Data de hoje + N meses (yyyy-mm-dd), no fuso de Brasília. */
export function validadePadrao(meses = VALIDADE_MESES, hoje = new Date()): string {
  const iso = hoje.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, d));
  // 31/jan + 1 mês não pode virar 3/mar: fica no último dia do mês.
  if (alvo.getUTCDate() !== d) alvo.setUTCDate(0);
  return alvo.toISOString().slice(0, 10);
}

export const dataBR = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

export type ValeCartao = {
  codigo: string;
  valor: number;
  saldo: number;
  para: string | null;
  de: string | null;
  mensagem: string | null;
  validade: string;
};
