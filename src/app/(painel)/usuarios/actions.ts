"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Garante que quem está chamando é o dono. Lança erro caso contrário.
async function garantirDono() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const { data } = await supabase
    .from("profiles")
    .select("papel")
    .eq("id", user.id)
    .single();
  if (data?.papel !== "dono") throw new Error("Sem permissão.");
  return user.id;
}

export async function criarUsuario(dados: {
  nome: string;
  email: string;
  senha: string;
  dono: boolean;
  permissoes: string[];
}) {
  await garantirDono();
  const admin = createAdminClient();

  const { data: novo, error } = await admin.auth.admin.createUser({
    email: dados.email.trim().toLowerCase(),
    password: dados.senha,
    email_confirm: true,
    user_metadata: { nome: dados.nome.trim() },
  });

  if (error || !novo?.user) {
    return { ok: false, erro: error?.message ?? "Falha ao criar usuário." };
  }

  // A trigger já criou o profile; ajusta papel + permissões.
  await admin
    .from("profiles")
    .update({
      nome: dados.nome.trim(),
      papel: dados.dono ? "dono" : "funcionario",
      permissoes: dados.dono ? [] : dados.permissoes,
    })
    .eq("id", novo.user.id);

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function atualizarPermissoes(
  id: string,
  dados: { dono: boolean; permissoes: string[] },
) {
  await garantirDono();
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({
      papel: dados.dono ? "dono" : "funcionario",
      permissoes: dados.dono ? [] : dados.permissoes,
    })
    .eq("id", id);
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function trocarSenha(id: string, senha: string) {
  await garantirDono();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, {
    password: senha,
  });
  revalidatePath("/usuarios");
  return { ok: !error, erro: error?.message };
}

export async function excluirUsuario(id: string) {
  const donoId = await garantirDono();
  if (id === donoId) {
    return { ok: false, erro: "Você não pode excluir a si mesmo." };
  }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  revalidatePath("/usuarios");
  return { ok: !error, erro: error?.message };
}
