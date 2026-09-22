"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";

// Trocar a chave é o botão de "perdi o controle do link": o endereço antigo
// morre na hora. Só quem entra no mural pode fazer isso.
export async function trocarChaveDoMural() {
  await exigirAcesso("/mural");
  const supabase = await createClient();
  const nova = crypto.randomUUID().replace(/-/g, "");
  const { data: atual } = await supabase.from("mural_config").select("empresa_id").maybeSingle();
  const empresaId = (atual as { empresa_id: string } | null)?.empresa_id;
  if (!empresaId) return { ok: false, erro: "Mural sem configuração nesta empresa." };
  const { error } = await supabase.from("mural_config").update({ chave: nova }).eq("empresa_id", empresaId);
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/mural");
  return { ok: true };
}
