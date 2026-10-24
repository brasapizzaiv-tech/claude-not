"use server";

// Classificar sangrias (migration 0252): escolher a categoria de várias de uma
// vez — cada uma vira despesa paga em dinheiro no financeiro.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { desfazerSangriaNoFinanceiro, lancarSangriaNoFinanceiro } from "@/lib/sangria-financeiro";

export async function lancarSangrias(movIds: string[], categoriaId: string) {
  await exigirAcesso(["/salao", "/financeiro"]);
  if (!/^[0-9a-f-]{36}$/i.test(categoriaId)) return { ok: false as const, mensagem: "Escolha a categoria." };
  const db = await createClient();
  let feitas = 0;
  for (const id of movIds.slice(0, 300)) {
    const r = await lancarSangriaNoFinanceiro(db, id, categoriaId);
    if (r.ok) feitas++;
  }
  revalidatePath("/salao/caixa/sangrias");
  revalidatePath("/financeiro");
  return { ok: true as const, feitas };
}

export async function desfazerSangria(movId: string) {
  await exigirAcesso(["/salao", "/financeiro"]);
  const db = await createClient();
  const r = await desfazerSangriaNoFinanceiro(db, movId);
  revalidatePath("/salao/caixa/sangrias");
  return r;
}
