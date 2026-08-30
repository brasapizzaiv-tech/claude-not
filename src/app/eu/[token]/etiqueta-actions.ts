"use server";

import { createAdminClient } from "@/lib/supabase/admin";

async function colabDoToken(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("id, nome, ativo, faz_etiquetas")
    .eq("token", token)
    .maybeSingle();
  return data && data.ativo && data.faz_etiquetas ? data : null;
}

// Cria uma etiqueta pelo app do colaborador (entra na fila da impressora).
export async function criarEtiquetaColab(token: string, dados: {
  produto_id: string;
  conservacao: string;
  quantidade: string;
  unidade: string;
  validade: string;
}) {
  const admin = createAdminClient();
  const colab = await colabDoToken(token);
  if (!colab) return { ok: false as const, mensagem: "Sem acesso." };
  if (!dados.produto_id) return { ok: false as const, mensagem: "Escolha o produto." };

  const { data: prod } = await admin.from("produtos").select("nome").eq("id", dados.produto_id).maybeSingle();

  // impressora: a única ativa (ou nenhuma se houver várias — cai na primeira).
  const { data: imps } = await admin.from("impressoras").select("id").eq("ativo", true).order("criado_em").limit(1);
  const impressoraId = imps?.[0]?.id ?? null;

  const { data, error } = await admin
    .from("etiquetas")
    .insert({
      produto_id: dados.produto_id,
      produto_nome: prod?.nome ?? "Produto",
      colaborador_nome: colab.nome,
      validade: dados.validade || null,
      conservacao: dados.conservacao || null,
      quantidade: dados.quantidade ? Number(dados.quantidade.replace(",", ".")) || null : null,
      unidade: dados.unidade || null,
      impressora_id: impressoraId,
      impressao_solicitada_em: new Date().toISOString(),
    })
    .select("id, numero")
    .single();

  if (error || !data) return { ok: false as const, mensagem: error?.message || "Não foi possível gerar." };
  return { ok: true as const, id: data.id as string, numero: data.numero as number };
}

// Consulta uma etiqueta lida pelo QR (para montar a lista antes da baixa).
export async function consultarEtiquetaColab(token: string, etiquetaId: string) {
  const admin = createAdminClient();
  const colab = await colabDoToken(token);
  if (!colab) return { ok: false as const, mensagem: "Sem acesso." };
  const { data } = await admin
    .from("etiquetas")
    .select("id, numero, produto_nome, status")
    .eq("id", etiquetaId)
    .maybeSingle();
  if (!data) return { ok: false as const, mensagem: "Etiqueta não encontrada." };
  return {
    ok: true as const,
    id: data.id as string,
    numero: data.numero as number,
    produto: data.produto_nome as string,
    status: data.status as string,
  };
}

// Dá baixa em várias etiquetas de uma vez (só as que ainda estão ativas).
export async function darBaixaLoteColab(token: string, ids: string[], status: "usada" | "descartada") {
  const admin = createAdminClient();
  const colab = await colabDoToken(token);
  if (!colab) return { ok: false as const, mensagem: "Sem acesso." };
  if (!ids?.length) return { ok: false as const, mensagem: "Nada para dar baixa." };
  const { data } = await admin
    .from("etiquetas")
    .update({ status, baixa_em: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "ativa")
    .select("id");
  return { ok: true as const, quantidade: data?.length ?? 0 };
}
