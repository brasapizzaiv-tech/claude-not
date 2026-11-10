"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaAtualId } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes-server";

// Ações da fila de impressão na Saúde do sistema. Quem cuida das impressoras
// (Central de Impressões) ou do salão pode mandar de novo ou descartar.
async function fila() {
  await exigirAcesso(["/impressao", "/salao"]);
  const empresaId = await empresaAtualId();
  if (!empresaId) throw new Error("Empresa não identificada.");
  return { admin: createAdminClient(), empresaId };
}

/** Manda o item de novo: zera as tentativas e solta a comanda retida. */
export async function imprimirDeNovo(id: string) {
  const { admin, empresaId } = await fila();
  const { error } = await admin
    .from("impressao_fila")
    .update({ tentativas: 0, retido_em: null, liberado_em: new Date().toISOString(), entregue_em: null })
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .is("impresso_em", null);
  revalidatePath("/saude");
  return error ? { ok: false, erro: "Não consegui mandar de novo." } : { ok: true };
}

/** Tira da fila sem imprimir (fica o registro de quando e por quê). */
export async function descartarDaFila(id: string) {
  const { admin, empresaId } = await fila();
  const { error } = await admin
    .from("impressao_fila")
    .update({ descartado_em: new Date().toISOString() })
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .is("impresso_em", null);
  revalidatePath("/saude");
  return error ? { ok: false, erro: "Não consegui descartar." } : { ok: true };
}
