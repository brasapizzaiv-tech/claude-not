"use server";

// Lembretes pelo app da equipe: "Visto" / "Feito". Confere NO SERVIDOR o token,
// o colaborador ativo, o PIN (cookie) e que o lembrete é mesmo pra essa pessoa
// e vale nesse dia — não basta o botão aparecer na tela.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { lembretesDoColaborador } from "@/lib/lembretes-server";

export async function confirmarLembreteApp(token: string, lembreteId: string, dia: string) {
  if (!token || !lembreteId || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { ok: false as const, mensagem: "Pedido inválido." };
  const admin = createAdminClient();
  const { data: colab } = await admin.from("colaboradores").select("id, empresa_id, ativo, pin").eq("token", token).maybeSingle();
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  if (!colab || !colab.ativo || !colab.pin || colab.pin !== pin) {
    return { ok: false as const, mensagem: "Entre com o seu PIN de novo." };
  }
  const meus = await lembretesDoColaborador(colab.id as string);
  if (!meus.some((m) => m.lembrete.id === lembreteId && m.dia === dia)) {
    return { ok: false as const, mensagem: "Este lembrete não está mais valendo. Puxe a tela pra atualizar." };
  }
  const { error } = await admin.from("lembrete_confirmacoes").upsert(
    { empresa_id: colab.empresa_id, lembrete_id: lembreteId, colaborador_id: colab.id, dia },
    { onConflict: "lembrete_id,colaborador_id,dia", ignoreDuplicates: true },
  );
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath(`/eu/${token}`);
  revalidatePath("/lembretes");
  return { ok: true as const };
}
