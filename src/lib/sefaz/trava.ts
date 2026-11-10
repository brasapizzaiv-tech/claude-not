// Trava da SEFAZ para buscas que PULAM a espera de 1 hora (auditoria NFE-02).
// Arquivo sem dependências, pra poder ser testado sozinho
// (scripts/sefaz-trava.test.mjs).
//
// Regra: depois de "nenhum documento" (137) a SEFAZ manda esperar 1 hora, e
// consultar antes renova o castigo. A busca forçada (logo depois de manifestar,
// ou o botão do usuário) pode pular a espera, mas:
//   - automática: no mínimo 10 min desde a última forçada;
//   - botão do usuário: no mínimo 1 hora;
//   - depois de um 656 ("consumo indevido"): nada pula a espera.

export const FORCADA_AUTO_MIN = 10;
export const FORCADA_MANUAL_MIN = 60;

export type TravaSefaz = {
  bloqueado_ate?: string | null;
  forcado_em?: string | null;
  ultimo_cstat?: string | null;
};

export function horaSP(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Pode pular a trava agora? Devolve o motivo quando não pode. */
export function podeForcar(cfg: TravaSefaz, manual: boolean, agora = Date.now()): { ok: true } | { ok: false; erro: string } {
  const ate = cfg.bloqueado_ate ? new Date(cfg.bloqueado_ate).getTime() : 0;
  if (!(ate > agora)) return { ok: true };
  if (cfg.ultimo_cstat === "656")
    return { ok: false, erro: `A SEFAZ bloqueou por excesso de consultas (656). A próxima busca só às ${horaSP(ate)}.` };
  const forcadoEm = cfg.forcado_em ? new Date(cfg.forcado_em).getTime() : 0;
  const minimo = (manual ? FORCADA_MANUAL_MIN : FORCADA_AUTO_MIN) * 60 * 1000;
  if (agora - forcadoEm < minimo) {
    return { ok: false, erro: `Já buscamos há pouco. Pra SEFAZ não bloquear, a próxima busca fica pra ${horaSP(Math.min(forcadoEm + minimo, ate))}.` };
  }
  return { ok: true };
}
