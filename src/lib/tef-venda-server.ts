// Registro de uma cobrança feita no pinpad (TEF) em telas que vendem com UM
// pagamento só — PDV de balcão e o "Receber" do delivery/retirada. O caixa do
// salão tem o seu próprio (pagarSelecao, vários pagamentos na conta); a regra é
// a mesma: a venda grava primeiro, a transação nasce "aprovada", e o navegador
// confirma (CNF) no pinpad e fecha aqui como "confirmada" (ou "desfeita").
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export type TefDaVenda = {
  idAgente: string;
  terminal: string | null;
  nsu: string | null;
  nsuHost: string | null;
  autorizacao: string | null;
  rede: string | null;
  bandeira: string | null;
  produto: string | null;
  tipo: "credito" | "debito" | "voucher" | "pix";
  parcelas: number;
  panMascarado: string | null;
  viaCliente: string[];
  viaLoja: string[];
};

/** Colunas do movimento do caixa que guardam o TEF. */
export function camposTefDoMov(t: TefDaVenda | null | undefined, bandeira?: string | null) {
  if (!t) return {};
  return {
    bandeira: ((t.bandeira || bandeira) || "").trim().slice(0, 30) || null,
    tef_nsu: t.nsu ?? null,
    tef_autorizacao: t.autorizacao ?? null,
    tef_rede: t.rede ?? null,
    tef_terminal: t.terminal ?? null,
  };
}

/** Grava a transação (status "aprovada") e devolve o id pra confirmar depois. */
export async function registrarTefDaVenda(
  supabase: Db,
  d: { caixaId: string | null; movId: string | null; comandaIds: string[]; valor: number; tef: TefDaVenda },
): Promise<string | null> {
  const { data: quem } = await supabase.auth.getUser();
  const t = d.tef;
  const { data } = await supabase
    .from("tef_transacoes")
    .insert({
      caixa_id: d.caixaId,
      comanda_ids: d.comandaIds,
      mov_id: d.movId,
      terminal: t.terminal,
      tipo: t.tipo,
      valor: d.valor,
      parcelas: Math.max(1, Number(t.parcelas) || 1),
      rede: t.rede,
      bandeira: t.bandeira,
      produto: t.produto,
      nsu: t.nsu,
      nsu_host: t.nsuHost,
      autorizacao: t.autorizacao,
      pan_mascarado: t.panMascarado,
      status: "aprovada",
      via_cliente: t.viaCliente ?? [],
      via_loja: t.viaLoja ?? [],
      id_agente: t.idAgente,
      criado_por: quem.user?.id ?? null,
    })
    .select("id")
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** Fecha a transação depois do CNF; confirmada → comprovante na fila de impressão. */
export async function fecharTefNoBanco(supabase: Db, transacaoId: string, confirmada: boolean, motivo?: string) {
  await supabase
    .from("tef_transacoes")
    .update({ status: confirmada ? "confirmada" : "desfeita", mensagem: motivo ?? null, atualizado_em: new Date().toISOString() })
    .eq("id", transacaoId);
  if (confirmada) {
    const { data: imps } = await supabase.from("impressoras").select("id").eq("ativo", true).eq("recebe_nfce", true);
    const ids = ((imps as { id: string }[]) ?? []).map((i) => i.id);
    if (ids.length > 0) {
      await supabase.from("impressao_fila").insert(ids.map((impressora_id) => ({ tipo: "tef", ref_id: transacaoId, impressora_id })));
    }
  }
}
