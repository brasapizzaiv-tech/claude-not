"use server";

import { createAdminClient } from "@/lib/supabase/admin";

type Item = { produto_id: string; qtd_estoque: number; qtd_pedir: number };

// Salva a contagem preenchida pelo colaborador via link público.
// Valida o token no servidor e só grava produtos das categorias atribuídas.
export async function salvarContagemPublica(token: string, itens: Item[]) {
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("contagem_links")
    .select("contagem_id, colaborador_id")
    .eq("token", token)
    .maybeSingle();
  if (!link) return { ok: false, erro: "Link inválido." };

  // Categorias atribuídas a este colaborador nesta contagem.
  const { data: atrib } = await admin
    .from("contagem_atribuicoes")
    .select("categoria_id")
    .eq("contagem_id", link.contagem_id)
    .eq("colaborador_id", link.colaborador_id);
  const categoriaIds = new Set((atrib ?? []).map((a) => a.categoria_id));
  if (categoriaIds.size === 0) return { ok: false, erro: "Sem categorias." };

  // Produtos válidos (dentro das categorias atribuídas).
  const { data: prods } = await admin
    .from("produtos")
    .select("id")
    .in("categoria_id", [...categoriaIds]);
  const validos = new Set((prods ?? []).map((p) => p.id));

  const paraGravar = itens
    .filter(
      (i) => validos.has(i.produto_id) && (i.qtd_estoque > 0 || i.qtd_pedir > 0),
    )
    .map((i) => ({ ...i, contagem_id: link.contagem_id }));

  if (paraGravar.length > 0) {
    await admin
      .from("contagem_itens")
      .upsert(paraGravar, { onConflict: "contagem_id,produto_id" });
  }

  await admin
    .from("contagem_links")
    .update({ status: "preenchida" })
    .eq("token", token);

  return { ok: true, gravados: paraGravar.length };
}
