"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Documentos que a gestão pediu pra pessoa assinar (migration 0257). Tudo
// confere o PIN do app e se o documento é dela.

async function pessoaDoToken(token: string) {
  const admin = createAdminClient();
  const { data: c } = await admin.from("colaboradores").select("id, ativo, pin").eq("token", token).maybeSingle();
  const colab = c as { id: string; ativo: boolean; pin: string | null } | null;
  const pin = (await cookies()).get(`eu_${token}`)?.value ?? "";
  if (!colab || !colab.ativo || !colab.pin || colab.pin !== pin) return null;
  return { admin, id: colab.id };
}

/** Link de 5 minutos pra abrir o arquivo. */
export async function abrirDocumentoEu(token: string, docId: string) {
  const p = await pessoaDoToken(token);
  if (!p) return { ok: false as const, erro: "Entre com o seu PIN de novo." };
  const { data } = await p.admin.from("colaborador_documentos").select("arquivo").eq("id", docId).eq("colaborador_id", p.id).eq("pedir_assinatura", true).maybeSingle();
  if (!data) return { ok: false as const, erro: "Documento não encontrado." };
  const { data: u } = await p.admin.storage.from("documentos-equipe").createSignedUrl((data as { arquivo: string }).arquivo, 300);
  return u?.signedUrl ? { ok: true as const, url: u.signedUrl } : { ok: false as const, erro: "Não consegui abrir o arquivo." };
}

/** "Li e assino": grava a hora, o IP e o aparelho. */
export async function assinarDocumentoEu(token: string, docId: string) {
  const p = await pessoaDoToken(token);
  if (!p) return { ok: false as const, erro: "Entre com o seu PIN de novo." };
  const h = await headers();
  const { data, error } = await p.admin.from("colaborador_documentos")
    .update({
      assinado_em: new Date().toISOString(),
      assinatura_ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null,
      assinatura_aparelho: (h.get("user-agent") ?? "").slice(0, 300) || null,
    })
    .eq("id", docId).eq("colaborador_id", p.id).eq("pedir_assinatura", true).is("assinado_em", null)
    .select("id");
  if (error) return { ok: false as const, erro: error.message };
  if (!data?.length) return { ok: false as const, erro: "Esse documento já foi assinado." };
  revalidatePath(`/eu/${token}/documentos`);
  revalidatePath(`/eu/${token}`);
  revalidatePath(`/colaboradores/${p.id}`);
  return { ok: true as const };
}
