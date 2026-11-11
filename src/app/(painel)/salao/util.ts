// Percentual de serviço aplicável agora (config + horário de São Paulo).
export function servicoAgora(cfg: Record<string, string>, agora = Date.now()) {
  const perc = Number(cfg.servico_percent || 0);
  if (perc <= 0) return 0;
  if (cfg.servico_so_noite === "1") {
    const brt = new Date(agora - 3 * 3600 * 1000);
    const hhmm = `${String(brt.getUTCHours()).padStart(2, "0")}:${String(brt.getUTCMinutes()).padStart(2, "0")}`;
    // CX-10: depois da meia-noite ainda é a noite ("00:30" < "18:00" zerava o
    // serviço). Até as 05:00 conta como noite.
    const noite = hhmm >= (cfg.servico_inicio || "18:00") || hhmm < "05:00";
    if (!noite) return 0;
  }
  return perc;
}
