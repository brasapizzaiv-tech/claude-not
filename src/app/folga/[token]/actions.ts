"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// App do funcionário (link pessoal, sem login). Tudo passa pelo servidor com o
// cliente admin, validando o token — nada de chave no navegador.

async function funcDoToken(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("folgas_funcionarios")
    .select("id, grupo, grupo2, ativo")
    .eq("token", token)
    .maybeSingle();
  return data && data.ativo ? data : null;
}

export async function pedirFolga(token: string, data: string, motivo: string, grupoAlvo?: string) {
  const admin = createAdminClient();
  const eu = await funcDoToken(token);
  if (!eu) return { ok: false as const, mensagem: "Link inválido." };
  if (!data) return { ok: false as const, mensagem: "Escolha a data." };

  const trava = (await admin.from("folgas_bloqueios").select("motivo").eq("data", data).maybeSingle()).data;
  if (trava?.motivo) return { ok: false as const, mensagem: `Data travada: ${trava.motivo}` };

  if (grupoAlvo && grupoAlvo !== eu.grupo && grupoAlvo !== eu.grupo2) {
    return { ok: false as const, mensagem: "Esse turno não é seu." };
  }

  const { error } = await admin.from("folgas_pedidos").insert({
    funcionario_id: eu.id,
    data,
    motivo: motivo?.trim() || null,
    status: "Pendente",
    origem: "app",
    grupo_alvo: grupoAlvo || null,
  });
  if (error) {
    if (error.code === "23505") return { ok: false as const, mensagem: "Você já tem um pedido nesse dia/turno." };
    return { ok: false as const, mensagem: error.message };
  }
  return { ok: true as const };
}

export async function cancelarMeuPedido(token: string, pedidoId: number) {
  const admin = createAdminClient();
  const eu = await funcDoToken(token);
  if (!eu) return { ok: false as const, mensagem: "Link inválido." };
  // só cancela pedido próprio e ainda pendente
  const { error } = await admin
    .from("folgas_pedidos")
    .delete()
    .eq("id", pedidoId)
    .eq("funcionario_id", eu.id)
    .eq("status", "Pendente");
  return error ? { ok: false as const, mensagem: error.message } : { ok: true as const };
}
