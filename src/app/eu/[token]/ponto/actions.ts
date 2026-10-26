"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeSP } from "@/lib/assiduidade-server";
import { ASSINATURA_DESDE, cicloDoDia, fechamentosDoCiclo, espelhoDaPessoa, resumoParaAssinar } from "@/lib/ponto-espelho";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A pessoa responde o espelho de um ciclo fechado: "está certo" (assina) ou
 * "não concordo" (com o motivo). Grava o resumo e o hash que ela viu, a hora,
 * o IP e o aparelho (migration 0254). O resumo é montado de novo aqui, no
 * servidor: não vale o que a tela mandar.
 */
export async function responderPonto(token: string, de: string, resposta: "assinado" | "discorda", comentario: string) {
  if (!DATA.test(de)) return { ok: false as const, erro: "Ciclo inválido." };
  const admin = createAdminClient();
  const { data: c } = await admin.from("colaboradores").select("id, empresa_id, ativo, pin, bate_ponto").eq("token", token).maybeSingle();
  const colab = c as { id: string; empresa_id: string; ativo: boolean; pin: string | null; bate_ponto: boolean } | null;
  const pin = (await cookies()).get(`eu_${token}`)?.value ?? "";
  if (!colab || !colab.ativo || !colab.pin || colab.pin !== pin) return { ok: false as const, erro: "Entre com o seu PIN de novo." };

  const ciclo = cicloDoDia(de);
  if (ciclo.de !== de || de < ASSINATURA_DESDE) return { ok: false as const, erro: "Ciclo inválido." };
  if (ciclo.ate >= hojeSP()) return { ok: false as const, erro: "Esse mês ainda não fechou. Dá pra assinar a partir do dia 21." };
  if (!(await fechamentosDoCiclo(admin, ciclo.de, [colab.id], colab.empresa_id)).has(colab.id)) return { ok: false as const, erro: "A gestão ainda está conferindo esse mês. Quando fechar, você assina aqui." };
  const motivo = comentario.trim().slice(0, 500);
  if (resposta === "discorda" && motivo.length < 3) return { ok: false as const, erro: "Escreva o que está errado." };

  const e = await espelhoDaPessoa(admin, colab.id, ciclo.de, ciclo.ate, colab.empresa_id);
  if (!e) return { ok: false as const, erro: "Seu cadastro não está marcado pra bater ponto." };
  const { resumo, hash } = resumoParaAssinar(e);
  const h = await headers();
  const { error } = await admin.from("ponto_assinaturas").insert({
    empresa_id: colab.empresa_id, colaborador_id: colab.id, de: ciclo.de, ate: ciclo.ate,
    resposta, comentario: motivo || null, resumo, hash,
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null,
    aparelho: (h.get("user-agent") ?? "").slice(0, 300) || null,
  });
  if (error) return { ok: false as const, erro: error.message };
  revalidatePath(`/eu/${token}/ponto`);
  revalidatePath(`/eu/${token}`);
  revalidatePath("/colaboradores/ponto");
  return { ok: true as const };
}
