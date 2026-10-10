"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { empresaAtualId } from "@/lib/empresa";
import { gerarPedidosKern } from "@/lib/kern-delivery";

const UUID = /^[0-9a-f-]{36}$/i;

export async function salvarKernDelivery(fd: FormData) {
  await exigirAcesso("/delivery");
  const empresaId = await empresaAtualId();
  if (!empresaId) return;
  const item = String(fd.get("item_id") ?? "");
  const clientes: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("cliente:") && UUID.test(String(v))) clientes[k.slice(8)] = String(v);
  }
  const supabase = await createClient();
  await supabase.from("kern_delivery_config").upsert({
    empresa_id: empresaId,
    ativo: fd.get("ativo") === "on",
    item_id: UUID.test(item) ? item : null,
    clientes,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: "empresa_id" });
  revalidatePath("/delivery/kern");
}

// Botão "Gerar agora": mesmo caminho da rotina das 08:35, pro dia de hoje.
// Serve pra quando entrou pedido depois (atualiza a quantidade) ou pra testar.
export async function gerarKernAgora() {
  await exigirAcesso("/delivery");
  const empresaId = await empresaAtualId();
  if (!empresaId) return { ok: false, mensagem: "Empresa não encontrada.", filiais: [] };
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const r = await gerarPedidosKern(empresaId, hoje);
  revalidatePath("/delivery/kern");
  revalidatePath("/delivery");
  return r;
}
