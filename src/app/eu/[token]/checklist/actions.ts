"use server";

// Checklists pelo app da equipe. Toda ação confere NO SERVIDOR: token válido,
// colaborador ativo, PIN batendo (cookie) e o SETOR da lista entre os setores
// da pessoa. A regra de gravação é a mesma do painel (src/lib/checklists-core.ts).
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import * as core from "@/lib/checklists-core";

export type ColabChecklist = { id: string; nome: string; setores: string[] };

export async function colabChecklist(token: string): Promise<ColabChecklist | null> {
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("id, nome, ativo, pin, checklist_setores")
    .eq("token", token)
    .maybeSingle();
  if (!data || !data.ativo) return null;
  const setores = (data.checklist_setores as string[] | null) ?? [];
  if (setores.length === 0) return null;
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  if (!data.pin || data.pin !== pin) return null;
  return { id: data.id as string, nome: data.nome as string, setores };
}

const SEM_PERMISSAO = { ok: false as const, mensagem: "Sem permissão — entre com o PIN de novo ou peça a liberação ao responsável." };

// Confere que o modelo é de um setor da pessoa (não basta esconder a tela).
async function modeloPermitido(db: core.Db, modeloId: string, colab: ColabChecklist) {
  const { data } = await db.from("checklist_modelos").select("id, setor_id, ativo").eq("id", modeloId).maybeSingle();
  const m = data as { id: string; setor_id: string; ativo: boolean } | null;
  if (!m || !m.ativo) return null;
  return colab.setores.includes(m.setor_id) ? m : null;
}
async function execucaoPermitida(db: core.Db, execucaoId: string, colab: ColabChecklist) {
  const { data } = await db.from("checklist_execucoes").select("id, modelo_id, data, concluido_em").eq("id", execucaoId).maybeSingle();
  const e = data as { id: string; modelo_id: string; data: string; concluido_em: string | null } | null;
  if (!e) return null;
  return (await modeloPermitido(db, e.modelo_id, colab)) ? e : null;
}

export async function abrirListaApp(token: string, modeloId: string, dia?: string) {
  const colab = await colabChecklist(token);
  if (!colab) return SEM_PERMISSAO;
  const db = createAdminClient() as core.Db;
  if (!(await modeloPermitido(db, modeloId, colab))) return SEM_PERMISSAO;
  const d = dia && core.diaValido(dia) ? dia : core.hojeSP();
  const r = await core.abrirExecucao(db, modeloId, d, { nome: colab.nome, colabId: colab.id });
  revalidatePath(`/eu/${token}/checklist`);
  return r;
}

export async function salvarRespostaApp(
  token: string,
  execucaoId: string,
  itemId: string,
  dados: { feito?: boolean; valor?: number | null; texto?: string | null },
) {
  const colab = await colabChecklist(token);
  if (!colab) return SEM_PERMISSAO;
  const db = createAdminClient() as core.Db;
  const exec = await execucaoPermitida(db, execucaoId, colab);
  if (!exec) return SEM_PERMISSAO;
  if (exec.concluido_em) return { ok: false as const, mensagem: "Esta lista já foi concluída." };
  const r = await core.salvarResposta(db, execucaoId, itemId, dados, { nome: colab.nome, colabId: colab.id });
  revalidatePath(`/eu/${token}/checklist`);
  return r;
}

// Foto do item: chega já comprimida do celular; sobe pelo servidor (o app não
// tem sessão do Supabase). Caminho com a empresa no começo.
export async function enviarFotoApp(token: string, execucaoId: string, itemId: string, form: FormData) {
  const colab = await colabChecklist(token);
  if (!colab) return SEM_PERMISSAO;
  const db = createAdminClient() as core.Db;
  const exec = await execucaoPermitida(db, execucaoId, colab);
  if (!exec) return SEM_PERMISSAO;
  const file = form.get("foto");
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, mensagem: "Foto não chegou." };
  if (file.size > 6 * 1024 * 1024) return { ok: false as const, mensagem: "Foto muito grande." };
  const admin = createAdminClient();
  const { data: empRow } = await admin.from("checklist_execucoes").select("empresa_id").eq("id", execucaoId).maybeSingle();
  const empresa = (empRow?.empresa_id as string) ?? "empresa";
  const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const path = `${empresa}/${exec.data}/${execucaoId}/${itemId}-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage.from("checklists").upload(path, bytes, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) return { ok: false as const, mensagem: "Não consegui enviar a foto. Tente de novo." };
  const { data: pub } = admin.storage.from("checklists").getPublicUrl(path);
  const r = await core.salvarResposta(db, execucaoId, itemId, { foto_url: pub.publicUrl }, { nome: colab.nome, colabId: colab.id });
  if (!r.ok) return r;
  revalidatePath(`/eu/${token}/checklist`);
  return { ok: true as const, url: pub.publicUrl };
}

export async function concluirListaApp(token: string, execucaoId: string) {
  const colab = await colabChecklist(token);
  if (!colab) return SEM_PERMISSAO;
  const db = createAdminClient() as core.Db;
  if (!(await execucaoPermitida(db, execucaoId, colab))) return SEM_PERMISSAO;
  const r = await core.concluirExecucao(db, execucaoId, { nome: colab.nome, colabId: colab.id });
  revalidatePath(`/eu/${token}/checklist`);
  revalidatePath("/checklists");
  return r;
}
