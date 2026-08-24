"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function criarContagem(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const descricao =
    (formData.get("descricao") as string)?.trim() ||
    `Contagem ${new Date().toLocaleDateString("pt-BR")}`;

  const { data, error } = await supabase
    .from("contagens")
    .insert({ descricao, responsavel_id: user?.id ?? null })
    .select("id")
    .single();

  if (error || !data) return;
  redirect(`/contagens/${data.id}`);
}

type ItemContagem = {
  produto_id: string;
  qtd_estoque: number;
  qtd_pedir: number;
  contado?: boolean; // marcado quando o item foi contado (inclusive "contei 0")
};

export async function salvarContagemItens(
  contagemId: string,
  itens: ItemContagem[],
) {
  const supabase = await createClient();

  // Grava os itens CONTADOS (inclusive os "contei 0"); se não vier o marcador
  // (contado), mantém o comportamento antigo (grava quem tem valor > 0).
  const contou = (i: ItemContagem) => i.contado ?? (i.qtd_estoque > 0 || i.qtd_pedir > 0);
  const paraGravar = itens
    .filter(contou)
    .map(({ produto_id, qtd_estoque, qtd_pedir }) => ({
      produto_id,
      qtd_estoque,
      qtd_pedir,
      contagem_id: contagemId,
    }));

  if (paraGravar.length > 0) {
    await supabase
      .from("contagem_itens")
      .upsert(paraGravar, { onConflict: "contagem_id,produto_id" });
  }

  // Remove itens que foram zerados (existiam antes, agora sem valor).
  const idsComValor = new Set(paraGravar.map((i) => i.produto_id));
  const zerados = itens
    .filter((i) => !idsComValor.has(i.produto_id))
    .map((i) => i.produto_id);
  if (zerados.length > 0) {
    await supabase
      .from("contagem_itens")
      .delete()
      .eq("contagem_id", contagemId)
      .in("produto_id", zerados);
  }

  revalidatePath(`/contagens/${contagemId}`);
  return { ok: true, gravados: paraGravar.length };
}

export async function finalizarContagem(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase
    .from("contagens")
    .update({ status: "finalizada" })
    .eq("id", id);
  revalidatePath(`/contagens/${id}`);
  revalidatePath("/contagens");
}

export async function reabrirContagem(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("contagens").update({ status: "rascunho" }).eq("id", id);
  revalidatePath(`/contagens/${id}`);
  revalidatePath("/contagens");
}

export async function excluirContagem(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("contagens").delete().eq("id", id);
  revalidatePath("/contagens");
}

// Atribui (ou desatribui) uma categoria a um colaborador nesta contagem.
// Cria uma contagem AVULSA: categorias escolhidas atribuídas a um colaborador,
// já com o link pronto para enviar.
export async function criarContagemAvulsa(
  categoriaIds: string[],
  colaboradorId: string,
) {
  const supabase = await createClient();
  if (!colaboradorId || categoriaIds.length === 0)
    return { ok: false as const };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: cats } = await supabase
    .from("categorias")
    .select("nome")
    .in("id", categoriaIds);
  const nomes = (cats ?? []).map((c) => c.nome).join(", ");
  const hoje = new Date().toLocaleDateString("pt-BR");

  const { data: cont } = await supabase
    .from("contagens")
    .insert({
      descricao: `Avulsa: ${nomes} (${hoje})`,
      responsavel_id: user?.id ?? null,
    })
    .select("id")
    .single();
  if (!cont) return { ok: false as const };

  await supabase.from("contagem_atribuicoes").upsert(
    categoriaIds.map((cid) => ({
      contagem_id: cont.id,
      categoria_id: cid,
      colaborador_id: colaboradorId,
    })),
    { onConflict: "contagem_id,categoria_id" },
  );

  const token = randomUUID().replace(/-/g, "");
  await supabase.from("contagem_links").insert({
    contagem_id: cont.id,
    colaborador_id: colaboradorId,
    token,
  });

  revalidatePath("/contagens");
  return { ok: true as const, contagemId: cont.id, token };
}

// Atribui TODAS as categorias a um colaborador (contagem inteira p/ 1 pessoa).
export async function atribuirTudo(contagemId: string, colaboradorId: string) {
  const supabase = await createClient();
  if (!colaboradorId) return;

  const { data: cats } = await supabase.from("categorias").select("id");
  if (cats?.length) {
    await supabase.from("contagem_atribuicoes").upsert(
      cats.map((c) => ({
        contagem_id: contagemId,
        categoria_id: c.id,
        colaborador_id: colaboradorId,
      })),
      { onConflict: "contagem_id,categoria_id" },
    );
  }

  const { data: existente } = await supabase
    .from("contagem_links")
    .select("id")
    .eq("contagem_id", contagemId)
    .eq("colaborador_id", colaboradorId)
    .maybeSingle();
  if (!existente) {
    await supabase.from("contagem_links").insert({
      contagem_id: contagemId,
      colaborador_id: colaboradorId,
      token: randomUUID().replace(/-/g, ""),
    });
  }

  // Remove links de quem ficou sem categoria.
  const { data: links } = await supabase
    .from("contagem_links")
    .select("id, colaborador_id")
    .eq("contagem_id", contagemId);
  const remover = (links ?? [])
    .filter((l) => l.colaborador_id !== colaboradorId)
    .map((l) => l.id);
  if (remover.length > 0) {
    await supabase.from("contagem_links").delete().in("id", remover);
  }

  revalidatePath(`/contagens/${contagemId}/atribuir`);
}

export async function salvarAtribuicao(
  contagemId: string,
  categoriaId: string,
  colaboradorId: string | null,
) {
  const supabase = await createClient();

  if (!colaboradorId) {
    await supabase
      .from("contagem_atribuicoes")
      .delete()
      .eq("contagem_id", contagemId)
      .eq("categoria_id", categoriaId);
  } else {
    await supabase.from("contagem_atribuicoes").upsert(
      {
        contagem_id: contagemId,
        categoria_id: categoriaId,
        colaborador_id: colaboradorId,
      },
      { onConflict: "contagem_id,categoria_id" },
    );

    // Garante um link (token) para este colaborador nesta contagem.
    const { data: existente } = await supabase
      .from("contagem_links")
      .select("id")
      .eq("contagem_id", contagemId)
      .eq("colaborador_id", colaboradorId)
      .maybeSingle();
    if (!existente) {
      await supabase.from("contagem_links").insert({
        contagem_id: contagemId,
        colaborador_id: colaboradorId,
        token: randomUUID().replace(/-/g, ""),
      });
    }
  }

  // Remove links de colaboradores que não têm mais nenhuma categoria aqui.
  const { data: comAtrib } = await supabase
    .from("contagem_atribuicoes")
    .select("colaborador_id")
    .eq("contagem_id", contagemId);
  const ativos = new Set(
    (comAtrib ?? []).map((a) => a.colaborador_id).filter(Boolean),
  );
  const { data: links } = await supabase
    .from("contagem_links")
    .select("id, colaborador_id")
    .eq("contagem_id", contagemId);
  const remover = (links ?? [])
    .filter((l) => !ativos.has(l.colaborador_id))
    .map((l) => l.id);
  if (remover.length > 0) {
    await supabase.from("contagem_links").delete().in("id", remover);
  }

  revalidatePath(`/contagens/${contagemId}/atribuir`);
}
