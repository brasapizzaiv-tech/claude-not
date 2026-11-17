"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";

// Sugestões do sistema (migration 0317): o dono marca como feita ou descarta.
export async function responderSugestao(
  id: number,
  status: "feito" | "descartado" | "pendente",
  resposta: string | null,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  await exigirAcesso("/sugestoes");
  if (!Number.isInteger(id) || !["feito", "descartado", "pendente"].includes(status)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sistema_sugestoes")
    .update({
      status,
      resposta: resposta?.trim() ? resposta.trim().slice(0, 1000) : null,
      respondido_em: status === "pendente" ? null : new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { ok: false, erro: "Não consegui salvar. Confira a internet e tente de novo." };
  revalidatePath("/sugestoes");
  revalidatePath("/", "layout");
  return { ok: true };
}
