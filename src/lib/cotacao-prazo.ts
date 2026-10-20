// Prazo pra responder a cotação (migration 0247). Funções puras: painel,
// mensagem do WhatsApp e link do fornecedor usam o mesmo texto.

const TZ = "America/Sao_Paulo";

/** "ter 21/10 às 18:00" */
export function textoPrazo(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short" }).replace(".", "");
  const dm = d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
  const hm = d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return `${dia} ${dm} às ${hm}`;
}

/** Quanto falta: "faltam 5 h", "faltam 40 min", "faltam 2 dias" — ou null se já passou. */
export function textoFalta(iso: string, agora = Date.now()): string | null {
  const ms = new Date(iso).getTime() - agora;
  if (ms <= 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 60) return `faltam ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `faltam ${h} h`;
  return `faltam ${Math.round(h / 24)} dias`;
}

export const venceu = (iso: string | null | undefined, agora = Date.now()) =>
  !!iso && new Date(iso).getTime() <= agora;

/** Valor do <input type="datetime-local"> (horário de Brasília) → ISO. */
export function deInput(v: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? new Date(`${v}:00-03:00`).toISOString() : null;
}

/** ISO → valor do <input type="datetime-local"> em horário de Brasília. */
export function paraInput(iso: string | null | undefined): string {
  return iso ? new Date(new Date(iso).getTime() - 3 * 3600000).toISOString().slice(0, 16) : "";
}

/** Prazo padrão a partir de agora, arredondado pra cima na meia hora
 *  (a mensagem e o banco calculam igual; o do banco nunca fica antes). */
export function prazoPadraoDesde(horas: number, agora = Date.now()): string {
  const meia = 30 * 60000;
  return new Date(Math.ceil((agora + horas * 3600000) / meia) * meia).toISOString();
}
