// Regra pura da conferência das notas (sem banco nem rede, pra ter teste):
// scripts/conferir-notas.test.mjs. Quem usa: src/lib/fiscal/conferir-notas.ts.

export const TEXTO_CONTINGENCIA_OK = "confirmada pela SEFAZ";

/**
 * O que gravar a partir da resposta da Focus (sem banco nem rede: testável).
 * Regras: contingência confirmada/pendente vira texto; autorizada em contingência
 * que a SEFAZ recusou depois fica marcada; cancelamento de nota com baixa no
 * saldo/caixa não fecha sozinho.
 */
export function interpretarConsulta(
  n: { status: string; mensagem: string | null; fiado_id?: string | null; mov_id?: string | null },
  c: { status?: string; mensagem?: string; bruto?: unknown },
): { status: string; mensagem: string | null } {
  const bruto = (c.bruto ?? {}) as Record<string, unknown>;
  let status = c.status ?? n.status;
  let mensagem = c.mensagem ?? n.mensagem;
  const emContingencia = bruto.contingencia_offline === true || /contingência offline/i.test(n.mensagem ?? "");
  if (status === "autorizado" && emContingencia) {
    const efetivada = bruto.contingencia_offline_efetivada;
    mensagem =
      efetivada === true
        ? `Autorizado o uso da NF-e (contingência offline) — ${TEXTO_CONTINGENCIA_OK}`
        : efetivada === false
          ? "Autorizado em contingência offline — a SEFAZ ainda não confirmou"
          : n.mensagem;
  }
  if (n.status === "autorizado" && status !== "autorizado" && emContingencia && status !== "cancelado") {
    mensagem = `RECUSADA DEPOIS DA CONTINGÊNCIA: ${c.mensagem ?? status}`;
  }
  // Cancelamento confirmado de nota avulsa com baixa no saldo/caixa: desfazer
  // exige alguém logado (o botão Consultar na tela), então avisa em vez de fechar.
  if (n.status === "cancelando" && status === "cancelado" && (n.fiado_id || n.mov_id)) {
    status = "cancelando";
    mensagem = "A SEFAZ cancelou. Clique em Cancelar nesta nota (Notas fiscais) pra desfazer a baixa no saldo/caixa.";
  }
  return { status, mensagem };
}

