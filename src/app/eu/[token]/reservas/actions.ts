"use server";

// Reservas pelo app da equipe (recepção). Toda ação confere NO SERVIDOR: token
// válido, colaborador ativo, caixinha "faz_recepcao" (migration 0313) e PIN
// batendo (cookie). Grava com a chave do servidor, sempre filtrando a empresa
// do colaborador. Só marca chegada e mesa — criar, remarcar e cancelar seguem
// no painel.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinConfere } from "@/lib/pin-colaborador";
import type { ResMobile } from "@/app/(painel)/reservas/hoje/mobile";

const SEM_PERMISSAO = { ok: false as const, mensagem: "Sem permissão. Entre com o PIN de novo ou peça a liberação ao responsável." };

export async function colabRecepcao(token: string): Promise<{ id: string; nome: string; empresaId: string } | null> {
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("id, nome, ativo, faz_recepcao, pin, empresa_id")
    .eq("token", token)
    .maybeSingle();
  if (!data || !data.ativo || !data.faz_recepcao) return null;
  const pin = (await cookies()).get(`eu_${token}`)?.value ?? "";
  if (!data.pin || !(await pinConfere(token, pin))) return null;
  return { id: data.id as string, nome: data.nome as string, empresaId: data.empresa_id as string };
}

export async function reservasDoDiaApp(token: string, dia: string): Promise<ResMobile[] | null> {
  const colab = await colabRecepcao(token);
  if (!colab || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const { data } = await createAdminClient()
    .from("reservas")
    .select("id, nome, telefone, turno, pessoas, adultos, criancas, mesa, ocasiao, observacao, status, chegou_em")
    .eq("empresa_id", colab.empresaId)
    .eq("data", dia)
    .neq("status", "cancelada")
    .order("turno")
    .order("criado_em");
  return (data as ResMobile[]) ?? [];
}

function atualizar(token: string) {
  revalidatePath(`/eu/${token}/reservas`);
  revalidatePath("/reservas");
  revalidatePath("/reservas/hoje");
}

export async function marcarChegouApp(token: string, id: string, chegou: boolean) {
  const colab = await colabRecepcao(token);
  if (!colab) return SEM_PERMISSAO;
  const { data, error } = await createAdminClient()
    .from("reservas")
    .update({ chegou_em: chegou ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("empresa_id", colab.empresaId)
    .select("id");
  if (error || !data?.length) return { ok: false as const, mensagem: "Não deu certo. Confira a internet e tente de novo." };
  atualizar(token);
  return { ok: true as const };
}

export async function atribuirMesaApp(token: string, id: string, mesa: string) {
  const colab = await colabRecepcao(token);
  if (!colab) return SEM_PERMISSAO;
  const { data, error } = await createAdminClient()
    .from("reservas")
    .update({ mesa: String(mesa ?? "").trim().slice(0, 20) || null })
    .eq("id", id)
    .eq("empresa_id", colab.empresaId)
    .select("id");
  if (error || !data?.length) return { ok: false as const, mensagem: "Não deu certo. Confira a internet e tente de novo." };
  atualizar(token);
  return { ok: true as const };
}
