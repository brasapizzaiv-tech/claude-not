// Percentual de serviço aplicável agora (config + horário de São Paulo).
export function servicoAgora(cfg: Record<string, string>) {
  const perc = Number(cfg.servico_percent || 0);
  if (perc <= 0) return 0;
  if (cfg.servico_so_noite === "1") {
    const brt = new Date(Date.now() - 3 * 3600 * 1000);
    const hhmm = `${String(brt.getUTCHours()).padStart(2, "0")}:${String(brt.getUTCMinutes()).padStart(2, "0")}`;
    if (hhmm < (cfg.servico_inicio || "18:00")) return 0;
  }
  return perc;
}
