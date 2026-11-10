"use server";

// Classificar sangrias (migration 0252): escolher a categoria de várias de uma
// vez — cada uma vira despesa paga em dinheiro no financeiro.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { desfazerSangriaNoFinanceiro, finDaSangria, lancarSangriaNoFinanceiro } from "@/lib/sangria-financeiro";

export async function lancarSangrias(movIds: string[], categoriaId: string) {
  await exigirAcesso(["/salao", "/financeiro"]);
  if (!/^[0-9a-f-]{36}$/i.test(categoriaId)) return { ok: false as const, mensagem: "Escolha a categoria." };
  const db = await createClient();
  const fin = await finDaSangria();
  if (!fin) return { ok: false as const, mensagem: "Não consegui saber a empresa deste acesso. Entre de novo." };
  let feitas = 0;
  for (const id of movIds.slice(0, 300)) {
    const r = await lancarSangriaNoFinanceiro(db, fin, id, categoriaId);
    if (r.ok) feitas++;
  }
  revalidatePath("/salao/caixa/sangrias");
  revalidatePath("/financeiro");
  revalidatePath("/cofre");
  return { ok: true as const, feitas };
}

export async function desfazerSangria(movId: string) {
  await exigirAcesso(["/salao", "/financeiro"]);
  const db = await createClient();
  const fin = await finDaSangria();
  if (!fin) return { ok: false as const, mensagem: "Não consegui saber a empresa deste acesso. Entre de novo." };
  const r = await desfazerSangriaNoFinanceiro(db, fin, movId);
  revalidatePath("/salao/caixa/sangrias");
  revalidatePath("/cofre");
  return r;
}
