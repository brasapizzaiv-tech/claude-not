"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lerNfe, lerResumo, soDigitos } from "@/lib/nfe";

// Primeiro dia do mês atual (AAAA-MM-01) — nota anterior a isso entra como paga.
function inicioDoMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type ItemNota = {
  cprod: string;
  descricao: string;
  ncm: string;
  ean: string;
  unidade: string;
  qtd: number;
  valor_unit: number;
  valor_total: number;
};

// Tenta casar cada item da nota com um produto cadastrado (pelo nome).
async function comProdutoVinculado(
  supabase: SupabaseClient,
  itens: ItemNota[],
) {
  const { data: prods } = await supabase
    .from("produtos")
    .select("id, nome")
    .eq("ativo", true);
  const lista = (prods ?? []).map((p) => ({ id: p.id, n: norm(p.nome) }));
  return itens.map((i) => {
    const d = norm(i.descricao);
    const m = lista.find((p) => p.n.length > 2 && (d.includes(p.n) || p.n.includes(d)));
    return { ...i, produto_id: m?.id ?? null };
  });
}

// Guarda as parcelas (duplicatas) da nota. Só quando há mais de uma — uma só é
// apenas o vencimento único, que já vai na coluna vencimento da nota.
async function salvarParcelas(
  supabase: SupabaseClient,
  notaId: string,
  parcelas: { numero: string; vencimento: string | null; valor: number }[],
) {
  await supabase.from("nota_parcelas").delete().eq("nota_id", notaId);
  if (parcelas.length > 1) {
    await supabase.from("nota_parcelas").insert(
      parcelas.map((p) => ({
        nota_id: notaId,
        numero: p.numero,
        vencimento: p.vencimento,
        valor: p.valor,
      })),
    );
  }
}

export async function importarNota(
  xmlText: string,
  clienteExterno?: SupabaseClient,
) {
  const supabase = clienteExterno ?? (await createClient());
  const nf = lerNfe(xmlText);

  if (!nf.chave) return { ok: false, erro: "Arquivo não parece uma NF-e válida." };

  // Casa o fornecedor pelo CNPJ (só dígitos).
  const { data: forns } = await supabase
    .from("fornecedores")
    .select("id, cnpj");
  const fornecedor = (forns ?? []).find(
    (f) => soDigitos(f.cnpj ?? "") === nf.emit_cnpj,
  );

  // Já existe? Se for um resumo (sem itens), ENRIQUECE com a nota completa.
  const { data: existe } = await supabase
    .from("notas_fiscais")
    .select("id")
    .eq("chave", nf.chave)
    .maybeSingle();
  if (existe) {
    const { count } = await supabase
      .from("nota_itens")
      .select("id", { count: "exact", head: true })
      .eq("nota_id", existe.id);
    if ((count ?? 0) > 0)
      return { ok: false, erro: "Esta nota já foi importada." };

    await supabase
      .from("notas_fiscais")
      .update({
        numero: nf.numero,
        serie: nf.serie,
        modelo: nf.modelo,
        valor: nf.valor,
        data_emissao: nf.data_emissao,
        vencimento: nf.vencimento,
        dest_cnpj: nf.dest_cnpj,
        fornecedor_id: fornecedor?.id ?? null,
      })
      .eq("id", existe.id);
    if (nf.itens.length > 0) {
      const itens = await comProdutoVinculado(supabase, nf.itens);
      await supabase
        .from("nota_itens")
        .insert(itens.map((i) => ({ ...i, nota_id: existe.id })));
    }
    await salvarParcelas(supabase, existe.id, nf.parcelas);

    revalidatePath("/notas");
    return { ok: true, notaId: existe.id, enriquecida: true };
  }

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
    const itens = await comProdutoVinculado(supabase, nf.itens);
    await supabase
      .from("nota_itens")
      .insert(itens.map((i) => ({ ...i, nota_id: nota.id })));
  }
  await salvarParcelas(supabase, nota.id, nf.parcelas);

  // A nota entra como PENDENTE. Só vira conta a pagar quando o usuário lançar.
  revalidatePath("/notas");
  return { ok: true, notaId: nota.id, fornecedorCasado: !!fornecedor };
}

// Importa um RESUMO de NF-e (resNFe do SEFAZ) — só cabeçalho, sem itens.
export async function importarResumo(
  resumoXml: string,
  clienteExterno?: SupabaseClient,
) {
  const supabase = clienteExterno ?? (await createClient());
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

  // A nota entra como PENDENTE (não vira conta automaticamente).
  return { ok: true };
}

// Vincula (ou corrige) o fornecedor da nota manualmente.
export async function vincularFornecedorNota(
  notaId: string,
  fornecedorId: string | null,
) {
  const supabase = await createClient();
  await supabase
    .from("notas_fiscais")
    .update({ fornecedor_id: fornecedorId || null })
    .eq("id", notaId);
  revalidatePath(`/notas/${notaId}`);
  revalidatePath("/notas");
  return { ok: true };
}

// Lança a nota no financeiro (vira conta a pagar) — comando do usuário.
// opts: vencimento do boleto e competência (mês AAAA-MM) escolhidos na revisão.
export async function lancarNota(
  notaId: string,
  opts?: {
    vencimento?: string | null;
    competencia?: string | null;
    parcelar?: boolean;
  },
) {
  const supabase = await createClient();
  const { data: nota } = await supabase
    .from("notas_fiscais")
    .select("id, numero, emit_nome, valor, data_emissao, vencimento, fornecedor_id, situacao, tipo, dre_categoria_id")
    .eq("id", notaId)
    .maybeSingle();
  if (!nota || nota.situacao === "lancada") return { ok: false };
  const ehServico = (nota as { tipo?: string }).tipo === "servico";

  // Parcelas (duplicatas) da nota — quando o usuário optar por lançar parcelado,
  // cada parcela vira uma conta a pagar com seu vencimento e valor.
  const { data: parcData } = await supabase
    .from("nota_parcelas")
    .select("numero, vencimento, valor")
    .eq("nota_id", notaId)
    .order("vencimento");
  const parcelas =
    (parcData as { numero: string | null; vencimento: string | null; valor: number }[]) ?? [];
  const usarParcelas = opts?.parcelar === true && parcelas.length > 1;

  // Persiste o vencimento informado na revisão.
  if (opts?.vencimento !== undefined) {
    await supabase
      .from("notas_fiscais")
      .update({ vencimento: opts.vencimento || null })
      .eq("id", notaId);
  }

  const { data: fallbackCat } = await supabase
    .from("dre_categorias")
    .select("id")
    .eq("tipo", "cmv")
    .eq("nome", "Compras (Pedidos)")
    .maybeSingle();
  const fallbackId = fallbackCat?.id ?? null;

  // Competência = mês escolhido (AAAA-MM → dia 01); senão, data de emissão.
  const dataLanc = opts?.competencia
    ? `${opts.competencia}-01`
    : ((nota.data_emissao as string) ?? new Date().toISOString().slice(0, 10));
  const pago = dataLanc < inicioDoMes(); // histórico entra pago
  const vencimento =
    opts?.vencimento !== undefined
      ? opts.vencimento || null
      : ((nota.vencimento as string) ?? null);
  const descricao = `NF ${nota.numero ?? ""} — ${nota.emit_nome ?? "fornecedor"}`;

  // Itens da nota (com o produto vinculado → conta do DRE).
  const { data: itensData } = await supabase
    .from("nota_itens")
    .select("valor_total, produtos(categorias(dre_categoria_id))")
    .eq("nota_id", notaId);
  type IN = {
    valor_total: number | null;
    produtos: { categorias: { dre_categoria_id: string | null } | null } | null;
  };
  const itens = (itensData as unknown as IN[]) ?? [];

  // Agrupa o valor por conta do DRE.
  const porConta = new Map<string | null, number>();
  if (ehServico) {
    // Serviço → tudo na categoria de despesa escolhida (ou no fallback).
    const contaServico =
      (nota as { dre_categoria_id?: string | null }).dre_categoria_id ??
      fallbackId;
    porConta.set(contaServico, Number(nota.valor));
  } else if (itens.length > 0) {
    for (const i of itens) {
      const contaId =
        i.produtos?.categorias?.dre_categoria_id ?? fallbackId;
      porConta.set(contaId, (porConta.get(contaId) ?? 0) + (Number(i.valor_total) || 0));
    }
  } else {
    // Resumo sem itens → um lançamento pelo total da nota.
    porConta.set(fallbackId, Number(nota.valor));
  }

  await supabase.from("lancamentos").delete().eq("nota_id", notaId);
  const contas = [...porConta.entries()].filter(([, v]) => v > 0);
  const totalNota =
    Number(nota.valor) || contas.reduce((s, [, v]) => s + v, 0);

  type LancNovo = {
    data: string;
    categoria_id: string | null;
    valor: number;
    descricao: string;
    fornecedor_id: string | null;
    origem: "nota";
    nota_id: string;
    vencimento: string | null;
    pago: boolean;
    pago_em: string | null;
  };
  const novos: LancNovo[] = [];

  if (usarParcelas && totalNota > 0) {
    // Cada conta do DRE é distribuída entre as parcelas (proporcional ao valor
    // de cada parcela); a última parcela absorve o centavo de arredondamento.
    for (const [contaId, valorConta] of contas) {
      let acumulado = 0;
      parcelas.forEach((p, idx) => {
        const ultima = idx === parcelas.length - 1;
        const fatia = ultima
          ? Math.round((valorConta - acumulado) * 100) / 100
          : Math.round((valorConta * (Number(p.valor) / totalNota)) * 100) / 100;
        acumulado += fatia;
        if (fatia <= 0) return;
        novos.push({
          data: dataLanc,
          categoria_id: contaId,
          valor: fatia,
          descricao: `${descricao} (parc. ${p.numero ?? idx + 1}/${parcelas.length})`,
          fornecedor_id: nota.fornecedor_id,
          origem: "nota",
          nota_id: notaId,
          vencimento: p.vencimento,
          pago,
          pago_em: pago ? dataLanc : null,
        });
      });
    }
  } else {
    for (const [contaId, valor] of contas) {
      novos.push({
        data: dataLanc,
        categoria_id: contaId,
        valor,
        descricao,
        fornecedor_id: nota.fornecedor_id,
        origem: "nota",
        nota_id: notaId,
        vencimento,
        pago,
        pago_em: pago ? dataLanc : null,
      });
    }
  }
  if (novos.length > 0) await supabase.from("lancamentos").insert(novos);

  await supabase
    .from("notas_fiscais")
    .update({ situacao: "lancada" })
    .eq("id", notaId);

  // Toda compra que entra atualiza o preço de referência do produto
  // (usado nas contagens/CMV e nas próximas cotações).
  const { data: itensRef } = await supabase
    .from("nota_itens")
    .select("produto_id, valor_unit")
    .eq("nota_id", notaId);
  for (const i of (itensRef as { produto_id: string | null; valor_unit: number | null }[]) ?? []) {
    if (i.produto_id && i.valor_unit != null && Number(i.valor_unit) > 0) {
      await supabase
        .from("produtos")
        .update({ preco_referencia: Number(i.valor_unit) })
        .eq("id", i.produto_id);
    }
  }

  revalidatePath("/notas");
  revalidatePath("/financeiro/contas");
  revalidatePath("/produtos");
  return { ok: true };
}

// Marca a nota como mercadoria ou serviço.
export async function definirTipoNota(notaId: string, tipo: string) {
  const supabase = await createClient();
  await supabase
    .from("notas_fiscais")
    .update({ tipo: tipo === "servico" ? "servico" : "mercadoria" })
    .eq("id", notaId);
  revalidatePath(`/notas/${notaId}`);
  return { ok: true };
}

// Define a categoria de despesa (DRE) de uma nota de serviço.
export async function definirCategoriaNota(
  notaId: string,
  categoriaId: string | null,
) {
  const supabase = await createClient();
  await supabase
    .from("notas_fiscais")
    .update({ dre_categoria_id: categoriaId || null })
    .eq("id", notaId);
  revalidatePath(`/notas/${notaId}`);
  return { ok: true };
}

// Cria um fornecedor novo (com o nome/CNPJ da nota) e já vincula à nota.
export async function criarEVincularFornecedor(
  notaId: string,
  nome: string,
  cnpj: string | null,
) {
  const supabase = await createClient();
  if (!nome.trim()) return { ok: false, erro: "Informe o nome do fornecedor." };
  const { data, error } = await supabase
    .from("fornecedores")
    .insert({ nome: nome.trim(), cnpj: cnpj || null })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: "Não foi possível cadastrar." };
  await supabase
    .from("notas_fiscais")
    .update({ fornecedor_id: data.id })
    .eq("id", notaId);
  revalidatePath(`/notas/${notaId}`);
  revalidatePath("/notas");
  revalidatePath("/fornecedores");
  return { ok: true, fornecedorId: data.id };
}

// Vincula um item da nota a um produto do sistema (para o CMV detalhado).
export async function vincularItemProduto(
  itemId: string,
  produtoId: string | null,
) {
  const supabase = await createClient();
  await supabase
    .from("nota_itens")
    .update({ produto_id: produtoId })
    .eq("id", itemId);
  return { ok: true };
}

// Estorna a nota lançada: remove a conta e volta para pendente (pode relançar).
export async function estornarNota(notaId: string) {
  const supabase = await createClient();
  await supabase.from("lancamentos").delete().eq("nota_id", notaId);
  await supabase
    .from("notas_fiscais")
    .update({ situacao: "pendente" })
    .eq("id", notaId);
  revalidatePath("/notas");
  revalidatePath("/financeiro/contas");
  return { ok: true };
}

// Marca a nota como cancelada e remove qualquer conta gerada por ela.
export async function cancelarNota(notaId: string) {
  const supabase = await createClient();
  await supabase.from("lancamentos").delete().eq("nota_id", notaId);
  await supabase
    .from("notas_fiscais")
    .update({ situacao: "cancelada" })
    .eq("id", notaId);
  revalidatePath("/notas");
  revalidatePath("/financeiro/contas");
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
