"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";

export async function criarContagem(formData: FormData) {
  await exigirAcesso("/contagens");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const descricao =
    (formData.get("descricao") as string)?.trim() ||
    `Contagem ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;

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
  parcelas?: unknown; // detalhe por local/etiqueta; null limpa (total mexido à mão)
  precisa_comprar?: boolean | null; // item "precisa comprar?" (migration 0231)
};

// Grava só o que MUDOU no painel (EST-01). Antes o painel mandava todos os
// produtos e apagava o que não estava preenchido NA TELA ABERTA: o que o contador
// gravou pelo link depois que o painel abriu sumia (com as parcelas por local).
//   gravar: o que foi contado/alterado aqui;
//   apagar: o que estava salvo quando a tela abriu e foi esvaziado aqui;
//   zerarSeFaltar (ao finalizar): "contei 0" só pra quem não tem linha nenhuma —
//   se o link gravou nesse meio tempo, a linha dele fica.
export async function salvarContagemItens(
  contagemId: string,
  mudancas: { gravar: ItemContagem[]; apagar?: string[]; zerarSeFaltar?: string[] },
): Promise<{ ok: boolean; gravados: number; mensagem?: string }> {
  await exigirAcesso("/contagens");
  const supabase = await createClient();
  const { data: c } = await supabase.from("contagens").select("status").eq("id", contagemId).maybeSingle();
  if (!c) return { ok: false, gravados: 0, mensagem: "Essa contagem não existe mais." };
  if (c.status === "finalizada") return { ok: false, gravados: 0, mensagem: "Essa contagem já foi finalizada. Reabra antes de mudar." };

  const paraGravar = mudancas.gravar.map(({ produto_id, qtd_estoque, qtd_pedir, parcelas, precisa_comprar }) => ({
    produto_id,
    qtd_estoque,
    qtd_pedir,
    parcelas: parcelas ?? null,
    precisa_comprar: precisa_comprar ?? null,
    contagem_id: contagemId,
  }));
  if (paraGravar.length > 0) {
    const { error } = await supabase.from("contagem_itens").upsert(paraGravar, { onConflict: "contagem_id,produto_id" });
    if (error) return { ok: false, gravados: 0, mensagem: "Não consegui salvar a contagem. Nada foi mudado; tente de novo." };
  }
  if (mudancas.apagar?.length) {
    const { error } = await supabase.from("contagem_itens").delete().eq("contagem_id", contagemId).in("produto_id", mudancas.apagar);
    if (error) return { ok: false, gravados: paraGravar.length, mensagem: "Salvei o que foi contado, mas não consegui limpar os itens esvaziados. Tente de novo." };
  }
  if (mudancas.zerarSeFaltar?.length) {
    const { error } = await supabase.from("contagem_itens").upsert(
      mudancas.zerarSeFaltar.map((produto_id) => ({ produto_id, contagem_id: contagemId, qtd_estoque: 0, qtd_pedir: 0, parcelas: null, precisa_comprar: null })),
      { onConflict: "contagem_id,produto_id", ignoreDuplicates: true },
    );
    if (error) return { ok: false, gravados: paraGravar.length, mensagem: "Não consegui marcar os itens em branco como 0. Tente de novo." };
  }

  revalidatePath(`/contagens/${contagemId}`);
  return { ok: true, gravados: paraGravar.length };
}

export async function finalizarContagem(formData: FormData) {
  await exigirAcesso("/contagens");
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
  await exigirAcesso("/contagens");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("contagens").update({ status: "rascunho" }).eq("id", id);
  revalidatePath(`/contagens/${id}`);
  revalidatePath("/contagens");
}

// Remove uma contagem em rascunho. A finalizada já entrou no CMV: apagar mudava o
// CMV de semanas passadas, então é recusada (reabrir primeiro, de propósito) (EST-02).
export async function excluirContagem(id: string): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  await exigirAcesso("/contagens");
  const supabase = await createClient();
  const { data: c, error: errLer } = await supabase.from("contagens").select("status").eq("id", id).maybeSingle();
  if (errLer) return { ok: false, mensagem: "Não consegui ler a contagem. Tente de novo." };
  if (!c) return { ok: false, mensagem: "Essa contagem não existe mais." };
  if (c.status === "finalizada")
    return { ok: false, mensagem: "Contagem finalizada já entrou no CMV e não pode ser removida. Se precisar mesmo, abra e reabra a contagem antes." };
  const { error } = await supabase.from("contagens").delete().eq("id", id);
  if (error) {
    if (error.code === "23503")
      return { ok: false, mensagem: "Essa contagem está ligada a uma cotação ou pedido e não pode ser removida." };
    return { ok: false, mensagem: "Não consegui remover a contagem. Nada foi apagado." };
  }
  revalidatePath("/contagens");
  return { ok: true };
}

// Atribui (ou desatribui) uma categoria a um colaborador nesta contagem.
// Cria uma contagem AVULSA: categorias escolhidas atribuídas a um colaborador,
// já com o link pronto para enviar.
export async function criarContagemAvulsa(
  categoriaIds: string[],
  colaboradorId: string,
) {
  await exigirAcesso("/contagens");
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
  await exigirAcesso("/contagens");
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
  await exigirAcesso("/contagens");
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
