"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function dados(formData: FormData) {
  const get = (k: string) => {
    const v = (formData.get(k) as string | null)?.trim();
    return v ? v : null;
  };
  return {
    nome: get("nome") ?? "",
    cnpj: get("cnpj"),
    contato: get("contato"),
    telefone: get("telefone"),
    email: get("email"),
    whatsapp: get("whatsapp"),
    observacoes: get("observacoes"),
    // Padrão das notas desse fornecedor (preenche sozinho ao vincular/importar).
    dre_categoria_id: get("dre_categoria_id"),
    tipo_nota: (() => { const t = get("tipo_nota"); return t === "mercadoria" || t === "servico" ? t : null; })(),
  };
}

// Categorias de produto do fornecedor → vínculos fornecedor_produto (é o que a
// cotação usa). Categoria marcada: liga todos os produtos ativos dela.
// Categoria desmarcada: desliga os produtos dela (os vínculos feitos produto a
// produto em outras categorias ficam como estão).
async function sincronizarCategoriasFornecedor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fornecedorId: string,
  novas: string[],
  antigas: string[],
) {
  const add = novas.filter((c) => !antigas.includes(c));
  const rem = antigas.filter((c) => !novas.includes(c));
  if (add.length) {
    const { data: prods } = await supabase.from("produtos").select("id").in("categoria_id", add).eq("ativo", true).limit(5000);
    const linhas = ((prods as { id: string }[]) ?? []).map((p) => ({ fornecedor_id: fornecedorId, produto_id: p.id }));
    for (let i = 0; i < linhas.length; i += 500) {
      await supabase.from("fornecedor_produto").upsert(linhas.slice(i, i + 500), { onConflict: "fornecedor_id,produto_id", ignoreDuplicates: true });
    }
  }
  if (rem.length) {
    const { data: prods } = await supabase.from("produtos").select("id").in("categoria_id", rem).limit(5000);
    const ids = ((prods as { id: string }[]) ?? []).map((p) => p.id);
    for (let i = 0; i < ids.length; i += 500) {
      await supabase.from("fornecedor_produto").delete().eq("fornecedor_id", fornecedorId).in("produto_id", ids.slice(i, i + 500));
    }
  }
}

export async function salvarFornecedor(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;
  const payload = dados(formData);
  const categoriaIds = formData.getAll("categoria_ids").map(String).filter(Boolean);

  if (!payload.nome) return;

  let fornecedorId = id;
  let antigas: string[] = [];
  if (id) {
    const { data: atual } = await supabase.from("fornecedores").select("categoria_ids").eq("id", id).maybeSingle();
    antigas = ((atual?.categoria_ids as string[] | null) ?? []);
    await supabase.from("fornecedores").update({ ...payload, categoria_ids: categoriaIds }).eq("id", id);
  } else {
    const { data } = await supabase.from("fornecedores").insert({ ...payload, categoria_ids: categoriaIds }).select("id").single();
    fornecedorId = (data?.id as string | undefined) ?? null;
  }
  if (fornecedorId) await sincronizarCategoriasFornecedor(supabase, fornecedorId, categoriaIds, antigas);
  revalidatePath("/fornecedores");
  revalidatePath("/produtos");
}

export async function excluirFornecedor(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  // Exclusão "suave": marca como inativo para preservar histórico.
  await supabase.from("fornecedores").update({ ativo: false }).eq("id", id);
  revalidatePath("/fornecedores");
}
