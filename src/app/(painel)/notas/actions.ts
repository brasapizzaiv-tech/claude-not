"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lerNfe, lerResumo, soDigitos } from "@/lib/nfe";

// Primeiro dia do mês atual (AAAA-MM-01) — nota anterior a isso entra como paga.
function inicioDoMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function importarNota(xmlText: string) {
  const supabase = await createClient();
  const nf = lerNfe(xmlText);

  if (!nf.chave) return { ok: false, erro: "Arquivo não parece uma NF-e válida." };

  // Já importada?
  const { data: existe } = await supabase
    .from("notas_fiscais")
    .select("id")
    .eq("chave", nf.chave)
    .maybeSingle();
  if (existe) return { ok: false, erro: "Esta nota já foi importada." };

  // Casa o fornecedor pelo CNPJ (só dígitos).
  const { data: forns } = await supabase
    .from("fornecedores")
    .select("id, cnpj");
  const fornecedor = (forns ?? []).find(
    (f) => soDigitos(f.cnpj ?? "") === nf.emit_cnpj,
  );

  const { data: nota, error } = await supabase
    .from("notas_fiscais")
    .insert({
      chave: nf.chave,
      numero: nf.numero,
      serie: nf.serie,
      modelo: nf.modelo,
      emit_cnpj: nf.emit_cnpj,
      emit_nome: nf.emit_nome,
      dest_cnpj: nf.dest_cnpj,
      valor: nf.valor,
      data_emissao: nf.data_emissao,
      vencimento: nf.vencimento,
      fornecedor_id: fornecedor?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !nota) return { ok: false, erro: "Não foi possível salvar a nota." };

  if (nf.itens.length > 0) {
    await supabase
      .from("nota_itens")
      .insert(nf.itens.map((i) => ({ ...i, nota_id: nota.id })));
  }

  // Cria a conta a pagar a partir da nota (CMV padrão).
  const { data: cat } = await supabase
    .from("dre_categorias")
    .select("id")
    .eq("tipo", "cmv")
    .eq("nome", "Compras (Pedidos)")
    .maybeSingle();

  const dataLanc = nf.data_emissao ?? new Date().toISOString().slice(0, 10);
  const pago = dataLanc < inicioDoMes();
  await supabase.from("lancamentos").insert({
    data: dataLanc,
    categoria_id: cat?.id ?? null,
    valor: nf.valor,
    descricao: `NF ${nf.numero} — ${nf.emit_nome}`,
    fornecedor_id: fornecedor?.id ?? null,
    origem: "nota",
    nota_id: nota.id,
    vencimento: nf.vencimento,
    pago,
    pago_em: pago ? dataLanc : null,
  });

  revalidatePath("/notas");
  revalidatePath("/financeiro/contas");
  return { ok: true, notaId: nota.id, fornecedorCasado: !!fornecedor };
}

// Importa um RESUMO de NF-e (resNFe do SEFAZ) — só cabeçalho, sem itens.
export async function importarResumo(resumoXml: string) {
  const supabase = await createClient();
  const r = lerResumo(resumoXml);
  if (!r.chave) return { ok: false };

  const { data: existe } = await supabase
    .from("notas_fiscais")
    .select("id")
    .eq("chave", r.chave)
    .maybeSingle();
  if (existe) return { ok: false, jaExiste: true };

  const { data: forns } = await supabase.from("fornecedores").select("id, cnpj");
  const fornecedor = (forns ?? []).find(
    (f) => soDigitos(f.cnpj ?? "") === r.emit_cnpj,
  );

  const { data: nota } = await supabase
    .from("notas_fiscais")
    .insert({
      chave: r.chave,
      numero: r.chave.slice(25, 34).replace(/^0+/, ""),
      emit_cnpj: r.emit_cnpj,
      emit_nome: r.emit_nome,
      valor: r.valor,
      data_emissao: r.data_emissao,
      fornecedor_id: fornecedor?.id ?? null,
    })
    .select("id")
    .single();
  if (!nota) return { ok: false };

  if (r.valor > 0) {
    const { data: cat } = await supabase
      .from("dre_categorias")
      .select("id")
      .eq("tipo", "cmv")
      .eq("nome", "Compras (Pedidos)")
      .maybeSingle();
    const dataLanc = r.data_emissao ?? new Date().toISOString().slice(0, 10);
    // Notas de meses anteriores entram já como pagas (histórico).
    const pago = dataLanc < inicioDoMes();
    await supabase.from("lancamentos").insert({
      data: dataLanc,
      categoria_id: cat?.id ?? null,
      valor: r.valor,
      descricao: `NF (resumo) — ${r.emit_nome}`,
      fornecedor_id: fornecedor?.id ?? null,
      origem: "nota",
      nota_id: nota.id,
      pago,
      pago_em: pago ? dataLanc : null,
    });
  }
  return { ok: true };
}

// Vincula (concilia) a nota a um pedido; remove o lançamento provisório do pedido.
export async function vincularPedido(notaId: string, pedidoId: string | null) {
  const supabase = await createClient();
  await supabase
    .from("notas_fiscais")
    .update({
      pedido_id: pedidoId,
      status: pedidoId ? "conciliada" : "importada",
    })
    .eq("id", notaId);

  if (pedidoId) {
    // Remove a conta provisória gerada pela conferência do pedido (evita duplicar).
    await supabase
      .from("lancamentos")
      .delete()
      .eq("pedido_id", pedidoId)
      .eq("origem", "pedido");
  }
  revalidatePath(`/notas/${notaId}`);
  revalidatePath("/financeiro/contas");
}

export async function excluirNota(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("lancamentos").delete().eq("nota_id", id);
  await supabase.from("notas_fiscais").delete().eq("id", id);
  revalidatePath("/notas");
  revalidatePath("/financeiro/contas");
}
