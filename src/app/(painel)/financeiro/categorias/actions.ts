"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { empresaAtualId } from "@/lib/empresa";

// Categorias do DRE: onde cada despesa e cada receita cai no relatório.
//
// Elas nasceram por migração e nunca tiveram tela. Esta é a tela — com uma
// trava que é o assunto principal do arquivo: CATEGORIA EM USO NÃO SE APAGA.
//
// Apagar uma categoria que já tem lançamento deixaria conta órfã e estragaria
// o DRE de meses que já foram fechados e enviados pra contabilidade. Então:
//   • sem nenhum lançamento  → apaga de verdade;
//   • com lançamento         → só desativa (some das listas novas, o histórico
//                              continua certo).
// A trava vale no servidor, não só na tela: o botão some, mas a regra é aqui.

const TIPOS = [
  "receita",
  "deducao",
  "cmv",
  "cmo",
  "tarifa",
  "despesa_fixa",
  "financeira",
  "imposto",
  "nao_operacional",
] as const;

function limpo(v: FormDataEntryValue | null, max = 60) {
  return String(v ?? "").trim().slice(0, max);
}

export async function criarCategoriaDre(formData: FormData) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  const nome = limpo(formData.get("nome"));
  const tipo = limpo(formData.get("tipo"), 30);
  const grupo = limpo(formData.get("grupo"), 40);
  if (!nome) return { ok: false as const, erro: "Escreva o nome da categoria." };
  if (!(TIPOS as readonly string[]).includes(tipo)) {
    return { ok: false as const, erro: "Escolha onde ela entra no DRE." };
  }
  if (!grupo) return { ok: false as const, erro: "Escolha ou escreva o grupo." };

  const empresaId = await empresaAtualId();
  // Já existe uma com esse nome e tipo? O banco recusaria (a chave é
  // empresa + tipo + nome), mas o erro do banco não diz nada pra quem lê.
  const { data: igual } = await supabase
    .from("dre_categorias")
    .select("id, ativo")
    .eq("tipo", tipo)
    .ilike("nome", nome)
    .maybeSingle();
  if (igual) {
    return {
      ok: false as const,
      erro: igual.ativo
        ? `Já existe uma categoria "${nome}" nesse lugar do DRE.`
        : `Já existe uma categoria "${nome}" nesse lugar do DRE, desativada. Reative em vez de criar outra.`,
    };
  }

  const { error } = await supabase
    .from("dre_categorias")
    .insert({ empresa_id: empresaId, nome, tipo, grupo, ativo: true, ordem: 999 });
  if (error) return { ok: false as const, erro: "Não consegui criar." };
  revalidatePath("/financeiro/categorias");
  return { ok: true as const };
}

export async function renomearCategoriaDre(id: string, nome: string, grupo: string) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  const n = nome.trim().slice(0, 60);
  const g = grupo.trim().slice(0, 40);
  if (!n || !g) return { ok: false as const, erro: "Nome e grupo não podem ficar vazios." };
  const { error } = await supabase
    .from("dre_categorias")
    .update({ nome: n, grupo: g })
    .eq("id", id);
  if (error) return { ok: false as const, erro: "Não consegui salvar." };
  revalidatePath("/financeiro/categorias");
  return { ok: true as const };
}

export async function alternarCategoriaDre(id: string, ativo: boolean) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  await supabase.from("dre_categorias").update({ ativo }).eq("id", id);
  revalidatePath("/financeiro/categorias");
  return { ok: true as const };
}

/** Apaga — e só deixa quando NADA aponta pra ela.
 *
 *  SEIS tabelas apontam pra cá, e duas com APAGAR EM CASCATA (orçamento e as
 *  regras da fatura do cartão): apagar a categoria levaria essas linhas junto,
 *  sem aviso nenhum. Por isso a conferência é uma por uma, e o erro diz o que
 *  está preso onde — "não deu" sem motivo obriga a pessoa a adivinhar.
 *
 *  A conferência é refeita aqui, mesmo já tendo sido feita pra montar a tela:
 *  entre carregar a página e clicar, alguém pode ter lançado uma conta. */
export async function excluirCategoriaDre(id: string) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();

  const usos: { rotulo: string; tabela: string; coluna: string }[] = [
    { rotulo: "lançamento(s)", tabela: "lancamentos", coluna: "categoria_id" },
    { rotulo: "categoria(s) de produto", tabela: "categorias", coluna: "dre_categoria_id" },
    { rotulo: "linha(s) de orçamento", tabela: "orcamentos", coluna: "categoria_id" },
    { rotulo: "nota(s) fiscal(is)", tabela: "notas_fiscais", coluna: "dre_categoria_id" },
    { rotulo: "fornecedor(es)", tabela: "fornecedores", coluna: "dre_categoria_id" },
    { rotulo: "regra(s) da fatura", tabela: "fatura_regras", coluna: "categoria_id" },
  ];

  const presos: string[] = [];
  for (const u of usos) {
    const { count } = await supabase
      .from(u.tabela)
      .select("id", { count: "exact", head: true })
      .eq(u.coluna, id);
    if ((count ?? 0) > 0) presos.push(`${count} ${u.rotulo}`);
  }

  if (presos.length > 0) {
    return {
      ok: false as const,
      erro: `Esta categoria está em uso: ${presos.join(", ")}. Desative em vez de apagar — apagar estragaria o DRE dos meses já fechados.`,
    };
  }

  const { error } = await supabase.from("dre_categorias").delete().eq("id", id);
  if (error) return { ok: false as const, erro: "Não consegui apagar." };
  revalidatePath("/financeiro/categorias");
  return { ok: true as const };
}
