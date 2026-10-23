// Garçom AVULSO (migration 0249): link da noite pra garçom esporádico entrar no
// app do garçom sem cadastro. Regras puras, usadas no painel e na entrada.

/** Fim da noite de serviço: as próximas 03:00 de Brasília (depois do fechamento). */
export function fimDaNoite(agora = Date.now()): string {
  const brt = new Date(agora - 3 * 3600 * 1000);
  const dia = brt.toISOString().slice(0, 10);
  let fim = new Date(`${dia}T03:00:00-03:00`).getTime();
  if (fim <= agora) fim += 86400000;
  return new Date(fim).toISOString();
}

export const tokenConvite = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);

/** "sáb 24/10 às 03:00" */
export function textoValidade(iso: string): string {
  const d = new Date(iso);
  const tz = "America/Sao_Paulo";
  const dia = d.toLocaleDateString("pt-BR", { timeZone: tz, weekday: "short" }).replace(".", "");
  return `${dia} ${d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}`;
}
