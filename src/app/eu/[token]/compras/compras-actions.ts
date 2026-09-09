"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Qualquer colaborador ativo, com o PIN batendo, pode pedir compras.
export async function colabPedidos(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("id, nome, ativo, pin")
    .eq("token", token)
    .maybeSingle();
  if (!data || !data.ativo) return null;
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  if (!data.pin || data.pin !== pin) return null;
  return { id: data.id as string, nome: data.nome as string };
}

export type Solicitacao = {
  id: number;
  item: string;
  quantidade: string | null;
  motivo: string | null;
  urgente: boolean;
  status: "pendente" | "comprado" | "rejeitado";
  resposta: string | null;
  respondido_em: string | null;
  criado_em: string;
};

export async function listarMinhasSolicitacoes(colabId: string): Promise<Solicitacao[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("solicitacoes_compra")
    .select("id, item, quantidade, motivo, urgente, status, resposta, respondido_em, criado_em")
    .eq("colaborador_id", colabId)
    .order("criado_em", { ascending: false })
    .limit(60);
  return (data as Solicitacao[]) ?? [];
}

export async function pedirCompra(
  token: string,
  input: { item: string; quantidade: string; motivo: string; urgente: boolean },
) {
  const colab = await colabPedidos(token);
  if (!colab) return { ok: false as const, mensagem: "Entre com o PIN de novo." };
  const item = (input.item || "").trim().slice(0, 200);
  if (item.length < 2) return { ok: false as const, mensagem: "Escreva o que precisa." };
  const admin = createAdminClient();
  const { error } = await admin.from("solicitacoes_compra").insert({
    colaborador_id: colab.id,
    nome: colab.nome,
    item,
    quantidade: (input.quantidade || "").trim().slice(0, 60) || null,
    motivo: (input.motivo || "").trim().slice(0, 500) || null,
    urgente: !!input.urgente,
  });
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath(`/eu/${token}/compras`);
  revalidatePath("/solicitacoes");
  return { ok: true as const };
}

// A própria pessoa pode desistir de um pedido que ainda está pendente.
export async function cancelarMinhaSolicitacao(token: string, id: number) {
  const colab = await colabPedidos(token);
  if (!colab) return { ok: false as const, mensagem: "Entre com o PIN de novo." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("solicitacoes_compra")
    .delete()
    .eq("id", id)
    .eq("colaborador_id", colab.id)
    .eq("status", "pendente");
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath(`/eu/${token}/compras`);
  revalidatePath("/solicitacoes");
  return { ok: true as const };
}
