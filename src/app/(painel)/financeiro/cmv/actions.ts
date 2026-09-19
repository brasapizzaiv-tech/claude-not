"use server";

import { revalidatePath } from "next/cache";
import { empresaAtualId } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";

// Corrige/insere a quantidade de um produto numa contagem (estoque inicial ou
// final da semana) — para ajustar contagem errada ou feita por fora.
export async function salvarContagemItem(
  contagemId: string,
  produtoId: string,
  qtd: number,
) {
  const supabase = await createClient();
  await supabase
    .from("contagem_itens")
    .upsert(
      { contagem_id: contagemId, produto_id: produtoId, qtd_estoque: qtd },
      { onConflict: "contagem_id,produto_id" },
    );
  revalidatePath("/financeiro/cmv");
  return { ok: true };
}

// Lança/atualiza o faturamento de um dia e turno (dia/noite).
export async function salvarFaturamentoDia(
  data: string,
  turno: string,
  valor: number,
) {
  const supabase = await createClient();
  // O par dia + turno virou dia + turno DENTRO da empresa (migration 0190),
  // senão dois restaurantes não poderiam faturar no mesmo dia. O upsert tem
  // que dizer os três, ou o banco não sabe qual linha atualizar.
  const empresaId = await empresaAtualId();
  if (!empresaId) return { ok: false as const };
  await supabase
    .from("faturamento_dia")
    .upsert(
      { empresa_id: empresaId, data, turno: turno === "noite" ? "noite" : "dia", valor },
      { onConflict: "empresa_id,data,turno" },
    );
  revalidatePath("/financeiro/cmv");
  return { ok: true };
}

// Corrige à mão o valor de Compras de um produto na semana (contagem final).
// valor null (ou vazio) remove a correção e volta ao valor automático.
export async function salvarComprasManual(
  contagemId: string,
  produtoId: string,
  valor: number | null,
) {
  const supabase = await createClient();
  if (valor == null) {
    await supabase
      .from("cmv_compras_manual")
      .delete()
      .eq("contagem_id", contagemId)
      .eq("produto_id", produtoId);
  } else {
    await supabase
      .from("cmv_compras_manual")
      .upsert(
        { contagem_id: contagemId, produto_id: produtoId, valor },
        { onConflict: "contagem_id,produto_id" },
      );
  }
  revalidatePath("/financeiro/cmv");
  return { ok: true };
}

// Marca se um produto entra (ou não) no cálculo do CMV.
export async function definirEntraCmvProduto(produtoId: string, entra: boolean) {
  const supabase = await createClient();
  await supabase.from("produtos").update({ entra_cmv: entra }).eq("id", produtoId);
  revalidatePath("/financeiro/cmv");
  revalidatePath("/produtos");
  return { ok: true };
}

// Marca uma categoria inteira como entra (ou não) no CMV.
export async function definirEntraCmvCategoria(
  categoriaId: string | null,
  entra: boolean,
) {
  const supabase = await createClient();
  const q = supabase.from("produtos").update({ entra_cmv: entra });
  if (categoriaId) await q.eq("categoria_id", categoriaId);
  else await q.is("categoria_id", null);
  revalidatePath("/financeiro/cmv");
  revalidatePath("/produtos");
  return { ok: true };
}
