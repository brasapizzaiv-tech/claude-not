"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";

function ok() {
  revalidatePath("/solicitacoes");
  return { ok: true as const };
}
const erro = (m: string) => ({ ok: false as const, mensagem: m });

// Responde um pedido: comprado / rejeitado (com recado opcional) ou volta pra pendente.
export async function responderSolicitacao(
  id: number,
  status: "pendente" | "comprado" | "rejeitado",
  resposta?: string,
) {
  await exigirAcesso("/solicitacoes");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const texto = (resposta || "").trim().slice(0, 500) || null;
  const { error } = await supabase
    .from("solicitacoes_compra")
    .update(
      status === "pendente"
        ? { status, resposta: null, respondido_em: null, respondido_por: null }
        : { status, resposta: texto, respondido_em: new Date().toISOString(), respondido_por: auth.user?.id ?? null },
    )
    .eq("id", id);
  if (error) return erro(error.message);
  return ok();
}

// Vários de uma vez (ex.: marcar tudo que foi comprado no mercado hoje).
export async function responderVarias(ids: number[], status: "comprado" | "rejeitado", resposta?: string) {
  await exigirAcesso("/solicitacoes");
  const lista = (ids ?? []).map(Number).filter((n) => Number.isFinite(n));
  if (lista.length === 0) return erro("Nada selecionado.");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const texto = (resposta || "").trim().slice(0, 500) || null;
  const { error } = await supabase
    .from("solicitacoes_compra")
    .update({ status, resposta: texto, respondido_em: new Date().toISOString(), respondido_por: auth.user?.id ?? null })
    .in("id", lista)
    .eq("status", "pendente");
  if (error) return erro(error.message);
  return ok();
}

// O dono também pode anotar um pedido (ex.: alguém falou de boca).
export async function criarSolicitacaoPainel(input: { colaboradorId: string | null; tipo: "compra" | "manutencao"; item: string; quantidade: string; motivo: string; urgente: boolean }) {
  await exigirAcesso("/solicitacoes");
  const item = (input.item || "").trim().slice(0, 200);
  if (item.length < 2) return erro("Escreva o que precisa.");
  const supabase = await createClient();
  let nome = "Anotado no painel";
  if (input.colaboradorId) {
    const { data: c } = await supabase.from("colaboradores").select("nome").eq("id", input.colaboradorId).maybeSingle();
    if (c?.nome) nome = c.nome as string;
  }
  const { error } = await supabase.from("solicitacoes_compra").insert({
    colaborador_id: input.colaboradorId || null,
    nome,
    tipo: input.tipo === "manutencao" ? "manutencao" : "compra",
    item,
    quantidade: (input.quantidade || "").trim().slice(0, 60) || null,
    motivo: (input.motivo || "").trim().slice(0, 500) || null,
    urgente: !!input.urgente,
  });
  if (error) return erro(error.message);
  return ok();
}

export async function excluirSolicitacao(id: number) {
  await exigirAcesso("/solicitacoes");
  const supabase = await createClient();
  const { error } = await supabase.from("solicitacoes_compra").delete().eq("id", id);
  if (error) return erro(error.message);
  return ok();
}
