"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinConfere } from "@/lib/pin-colaborador";
import { explicarErro } from "@/lib/erro-amigavel";

// Colaborador com a função "contas" E com o PIN batendo (dado financeiro exige o PIN).
export async function colabContas(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("id, nome, ativo, faz_contas, pin, empresa_id")
    .eq("token", token)
    .maybeSingle();
  if (!data || !data.ativo || !data.faz_contas) return null;
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  if (!data.pin || !(await pinConfere(token, pin))) return null;
  return { id: data.id as string, nome: data.nome as string, empresaId: data.empresa_id as string };
}

// Dá baixa em várias contas pelo app (mesma regra do painel: só as ainda abertas).
export async function pagarContasColab(token: string, ids: string[], dataPago: string) {
  const colab = await colabContas(token);
  if (!colab) return { ok: false as const, mensagem: "Sem acesso." };
  const lista = (ids ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (lista.length === 0) return { ok: false as const, mensagem: "Nada selecionado." };
  const hojeBR = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(dataPago) ? dataPago : hojeBR;
  const admin = createAdminClient();
  const { data: upd, error } = await admin
    .from("lancamentos")
    .update({ pago: true, pago_em: data })
    .in("id", lista)
    .eq("empresa_id", colab.empresaId)
    .eq("pago", false)
    .select("id");
  if (error) return { ok: false as const, mensagem: explicarErro(error) };
  return { ok: true as const, quantidade: upd?.length ?? 0 };
}
