"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// --- Leitor de NF-e (XML 4.00) ---
const pick = (xml: string, tag: string) => {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : "";
};
const bloco = (xml: string, tag: string) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
};
const soDigitos = (s: string) => (s || "").replace(/\D/g, "");

function lerNfe(xml: string) {
  const chave = (xml.match(/Id="NFe(\d{44})"/) || [])[1] ?? "";
  const emit = bloco(xml, "emit");
  const dest = bloco(xml, "dest");
  const ide = bloco(xml, "ide");
  const icmsTot = bloco(xml, "ICMSTot");
  const cobr = bloco(xml, "cobr");

  const itens = (xml.match(/<det[^>]*>[\s\S]*?<\/det>/g) || []).map((det) => {
    const prod = bloco(det, "prod");
    return {
      cprod: pick(prod, "cProd"),
      descricao: pick(prod, "xProd"),
      ncm: pick(prod, "NCM"),
      ean: pick(prod, "cEAN"),
      unidade: pick(prod, "uCom"),
      qtd: Number(pick(prod, "qCom")) || 0,
      valor_unit: Number(pick(prod, "vUnCom")) || 0,
      valor_total: Number(pick(prod, "vProd")) || 0,
    };
  });

  return {
    chave,
    numero: pick(ide, "nNF"),
    serie: pick(ide, "serie"),
    modelo: pick(ide, "mod"),
    data_emissao: pick(ide, "dhEmi").slice(0, 10) || null,
    emit_cnpj: soDigitos(pick(emit, "CNPJ")),
    emit_nome: pick(emit, "xNome"),
    dest_cnpj: soDigitos(pick(dest, "CNPJ")),
    valor: Number(pick(icmsTot, "vNF")) || 0,
    vencimento: (cobr.match(/<dVenc>([\s\S]*?)<\/dVenc>/) || [])[1] ?? null,
    itens,
  };
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

  await supabase.from("lancamentos").insert({
    data: nf.data_emissao ?? new Date().toISOString().slice(0, 10),
    categoria_id: cat?.id ?? null,
    valor: nf.valor,
    descricao: `NF ${nf.numero} — ${nf.emit_nome}`,
    fornecedor_id: fornecedor?.id ?? null,
    origem: "nota",
    nota_id: nota.id,
    vencimento: nf.vencimento,
    pago: false,
  });

  revalidatePath("/notas");
  revalidatePath("/financeiro/contas");
  return { ok: true, notaId: nota.id, fornecedorCasado: !!fornecedor };
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
