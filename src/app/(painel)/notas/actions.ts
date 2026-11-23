"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ligarNotaAoPedido, recalcularDoItemNota, type Db as DbConf } from "@/lib/conferencia-core";
import { lerNfe, type NfeLida, lerResumo, soDigitos } from "@/lib/nfe";
import { buscarCupomNfce } from "@/lib/nfce-consulta";
import { ajustarTotalBoleto, aplicarValorBoletoNota } from "@/lib/boleto";
import { hojeSP } from "@/lib/etiqueta-vencimentos";
import { moedaBR } from "@/lib/format";
import { exigirAcesso } from "@/lib/permissoes-server";
import { explicarErro } from "@/lib/erro-amigavel";
import { iaConfigurada, lerRascunho } from "@/lib/rascunho-ia";
import { linhaFecha, MODELO_RASCUNHO, UNIDADES_RASCUNHO, type LeituraRascunho, type LinhaRascunho } from "@/lib/rascunho";
import { buscarTodas } from "@/lib/supabase/todas";
import { perfilDaSessao, usuarioDaSessao } from "@/lib/sessao";

// Primeiro dia do mês atual (AAAA-MM-01) — nota anterior a isso entra como paga.
function inicioDoMes() {
  return `${hojeSP().slice(0, 7)}-01`; // fuso de Brasília
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

// Tenta casar cada item da nota com um produto cadastrado.
// 1) Se o mesmo texto do mesmo fornecedor já foi ligado antes, NÃO chuta pelo
//    nome: deixa vazio e o gatilho da 0205/0210 põe a ligação aprendida (e o
//    fator). Antes o chute pelo nome vinha primeiro e o gatilho respeitava o
//    chute — "STIKADINHO MORANGO" ia pro produto "Morango" toda semana em vez
//    do que a pessoa tinha ligado (pedido de 18/11/2026).
// 2) Senão, chuta pelo nome — palavra inteira, o nome mais comprido primeiro
//    ("Uva" não casa mais com "LUVA", nem "Mel" com "CARAMELO").
async function comProdutoVinculado(
  supabase: SupabaseClient,
  itens: (ItemNota & { produto_id?: string | null })[],
  cnpj: string | null,
) {
  const descricoes = [...new Set(itens.map((i) => (i.descricao ?? "").trim()).filter(Boolean))];
  const aprendidas = new Set<string>();
  if (cnpj && descricoes.length > 0) {
    // Uma busca por texto (limit 1): o histórico inteiro passaria das 1000 linhas.
    const achou = await Promise.all(
      descricoes.map((d) =>
        supabase
          .from("nota_itens")
          .select("id, notas_fiscais!inner(emit_cnpj)")
          .eq("notas_fiscais.emit_cnpj", cnpj)
          .not("produto_id", "is", null)
          .ilike("descricao", d.replace(/[\\%_]/g, (c) => `\\${c}`))
          .limit(1)
          .then((r) => ((r.data ?? []).length > 0 ? d.toLowerCase() : null)),
      ),
    );
    for (const d of achou) if (d) aprendidas.add(d);
  }

  const { data: prods } = await supabase
    .from("produtos")
    .select("id, nome")
    .eq("ativo", true)
    .limit(5000);
  const lista = (prods ?? [])
    .map((p) => ({ id: p.id, n: norm(p.nome) }))
    .filter((p) => p.n.length > 2)
    .sort((a, b) => b.n.length - a.n.length);
  return itens.map((i) => {
    if (aprendidas.has((i.descricao ?? "").trim().toLowerCase())) return { ...i, produto_id: null };
    // Já veio com o produto (rascunho lido pela IA com o nome do cadastro).
    if (i.produto_id) return i;
    const d = ` ${norm(i.descricao)} `;
    const m = lista.find((p) => d.includes(` ${p.n} `));
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
  // Com cliente externo é a busca automática do SEFAZ (cron, já autenticada
  // pelo próprio segredo) — não há usuário logado pra conferir.
  if (!clienteExterno) await exigirAcesso("/notas");
  const supabase = clienteExterno ?? (await createClient());
  return gravarNotaLida(supabase, lerNfe(xmlText));
}

// Cupom fiscal (NFC-e) lido pelo QR code: a SEFAZ devolve os itens e a nota
// entra pendente em Notas Fiscais, igual às de XML (pedido do Rafael,
// 10/11/2026: compras no supermercado). Só no painel.
export async function importarCupomNfce(textoDoQr: string) {
  await exigirAcesso("/notas");
  const r = await buscarCupomNfce(textoDoQr);
  if (!r.ok) return { ok: false as const, erro: r.erro };
  const supabase = await createClient();
  const g = await gravarNotaLida(supabase, r.cupom);
  if (!g.ok) return { ok: false as const, erro: g.erro ?? "Não consegui salvar o cupom." };
  return {
    ok: true as const,
    notaId: g.notaId,
    fornecedor: r.cupom.emit_nome,
    valor: r.cupom.valor,
    itens: r.cupom.itens.length,
    pagamentos: r.cupom.pagamentos,
  };
}

// Grava a nota já lida (do XML da NF-e ou do cupom NFC-e).
async function gravarNotaLida(supabase: SupabaseClient, nf: NfeLida) {
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
      const itens = await comProdutoVinculado(supabase, nf.itens, nf.emit_cnpj || null);
      const { error: eItens } = await supabase
        .from("nota_itens")
        .insert(itens.map((i) => ({ ...i, nota_id: existe.id })));
      // Sem os itens a nota ficaria "completa" vazia (NFE-06): devolve a falha
      // pra busca não dar o documento por importado (a autocura tenta de novo).
      if (eItens) return { ok: false, erro: `Não foi possível salvar os itens da nota: ${eItens.message}` };
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
    const itens = await comProdutoVinculado(supabase, nf.itens, nf.emit_cnpj || null);
    const { error: eItens } = await supabase
      .from("nota_itens")
      .insert(itens.map((i) => ({ ...i, nota_id: nota.id })));
    if (eItens) {
      // A nota fica como resumo: a próxima busca completa os itens pelo caminho
      // de "enriquecer", que não aplica o padrão do fornecedor — então já aplica.
      await salvarParcelas(supabase, nota.id, nf.parcelas);
      await aplicarPadraoFornecedor(supabase, nota.id, fornecedor?.id ?? null);
      return { ok: false, erro: `A nota entrou, mas os itens não gravaram: ${eItens.message}` };
    }
  }
  await salvarParcelas(supabase, nota.id, nf.parcelas);
  await aplicarPadraoFornecedor(supabase, nota.id, fornecedor?.id ?? null);

  // A nota entra como PENDENTE. Só vira conta a pagar quando o usuário lançar.
  revalidatePath("/notas");
  return { ok: true, notaId: nota.id, fornecedorCasado: !!fornecedor };
}

// Importa um RESUMO de NF-e (resNFe do SEFAZ) — só cabeçalho, sem itens.
export async function importarResumo(
  resumoXml: string,
  clienteExterno?: SupabaseClient,
) {
  if (!clienteExterno) await exigirAcesso("/notas");
  const supabase = clienteExterno ?? (await createClient());
  const r = lerResumo(resumoXml);
  if (!r.chave) return { ok: false, semChave: true };

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
  await aplicarPadraoFornecedor(supabase, nota.id, fornecedor?.id ?? null);

  // A nota entra como PENDENTE (não vira conta automaticamente).
  return { ok: true };
}

// Define as parcelas de uma nota manualmente (para notas já importadas sem as
// duplicatas, ou para corrigir). Menos de 2 parcelas válidas = sem parcelamento.
export async function salvarParcelasNota(
  notaId: string,
  parcelas: { numero?: string | null; vencimento: string | null; valor: number }[],
) {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  await supabase.from("nota_parcelas").delete().eq("nota_id", notaId);
  const validas = parcelas.filter((p) => Number(p.valor) > 0);
  if (validas.length > 1) {
    await supabase.from("nota_parcelas").insert(
      validas.map((p, i) => ({
        nota_id: notaId,
        numero: p.numero ?? String(i + 1),
        vencimento: p.vencimento || null,
        valor: Number(p.valor),
      })),
    );
  }
  revalidatePath(`/notas/${notaId}`);
  revalidatePath("/notas");
  return { ok: true, total: validas.length > 1 ? validas.length : 0 };
}

// Vincula (ou corrige) o fornecedor da nota manualmente.
export async function vincularFornecedorNota(
  notaId: string,
  fornecedorId: string | null,
) {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  await supabase
    .from("notas_fiscais")
    .update({ fornecedor_id: fornecedorId || null })
    .eq("id", notaId);
  await aplicarPadraoFornecedor(supabase, notaId, fornecedorId || null);
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
  await exigirAcesso(["/notas", "/financeiro"]); // também usada pela conciliação bancária
  const supabase = await createClient();
  const { data: nota } = await supabase
    .from("notas_fiscais")
    .select("id, numero, modelo, emit_nome, valor, data_emissao, vencimento, fornecedor_id, situacao, tipo, dre_categoria_id")
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
    : ((nota.data_emissao as string) ?? hojeSP());
  const vencimento =
    opts?.vencimento !== undefined
      ? opts.vencimento || null
      : ((nota.vencimento as string) ?? null);
  // Histórico (competência de mês passado) entra como já pago — MAS só se o
  // boleto também já venceu. Nota de agosto vencendo em setembro é conta a pagar.
  const pago = dataLanc < inicioDoMes() && (!vencimento || vencimento < hojeSP());
  // Quando o sistema assume que já foi paga, a data do pagamento é o VENCIMENTO
  // (é quando o boleto some da conta), não o 1º dia da competência. Com o 1º dia
  // a conciliação media a distância errada: a NF 666 da Ovos venceu 21/08, foi
  // gravada como paga em 01/08 e o débito de 21/08 aparecia a "20 dias".
  const pagoEm = pago ? vencimento ?? dataLanc : null;
  const descricao = (nota as { modelo?: string | null }).modelo === MODELO_RASCUNHO
    ? `Rascunho ${nota.numero ?? ""} — ${nota.emit_nome ?? "fornecedor"}`
    : `NF ${nota.numero ?? ""} — ${nota.emit_nome ?? "fornecedor"}`;

  // Itens da nota (com o produto vinculado → conta do DRE).
  const { data: itensData } = await supabase
    .from("nota_itens")
    .select("valor_total, destino, produtos(categorias(dre_categoria_id))")
    .eq("nota_id", notaId);
  type IN = {
    valor_total: number | null;
    destino: string | null;
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
    // Item que não é da casa (migration 0243): Ana/Rafa → "Consumo dos
    // sócios"; funcionário → "Outras despesas com pessoal" (volta descontado
    // pela Compra interna dele).
    const contaDestino = new Map<string, string | null>();
    if (itens.some((i) => i.destino)) {
      const { data: cs } = await supabase.from("dre_categorias").select("id, nome").in("nome", ["Consumo dos sócios", "Outras despesas com pessoal"]);
      const porNome = new Map(((cs as { id: string; nome: string }[]) ?? []).map((c) => [c.nome, c.id]));
      contaDestino.set("socios", porNome.get("Consumo dos sócios") ?? null);
      contaDestino.set("funcionario", porNome.get("Outras despesas com pessoal") ?? null);
    }
    for (const i of itens) {
      const contaId =
        (i.destino ? contaDestino.get(i.destino) : null) ??
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
    lancamento_em: string;
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
        acumulado = Math.round((acumulado + fatia) * 100) / 100;
        if (fatia <= 0) return;
        novos.push({
          data: dataLanc,
          categoria_id: contaId,
          valor: fatia,
          descricao: `${descricao} (parc. ${p.numero ?? idx + 1}/${parcelas.length})`,
          fornecedor_id: nota.fornecedor_id,
          origem: "nota",
          nota_id: notaId,
          lancamento_em: hojeSP(),
          vencimento: p.vencimento,
          pago,
          pago_em: pago ? p.vencimento ?? pagoEm : null,
        });
      });
    }
  } else {
    for (const [contaId, valor] of contas) {
      novos.push({
        data: dataLanc,
        categoria_id: contaId,
        // FIN-05: a soma dos itens por conta vinha com resíduo (647,3199999999999).
        valor: Math.round(valor * 100) / 100,
        descricao,
        fornecedor_id: nota.fornecedor_id,
        origem: "nota",
        nota_id: notaId,
        lancamento_em: hojeSP(),
        vencimento,
        pago,
        pago_em: pagoEm,
      });
    }
  }
  if (novos.length > 0) await supabase.from("lancamentos").insert(novos);

  await supabase
    .from("notas_fiscais")
    .update({ situacao: "lancada" })
    .eq("id", notaId);
  // Lançar é "dar entrada": a contagem soma o que chegou por esta data (não
  // pela emissão — a Deale emite numa semana e entrega na outra). Se alguém já
  // marcou a entrada antes, na tela da nota, fica a data marcada.
  await supabase
    .from("notas_fiscais")
    .update({ entrada_em: new Date().toISOString() })
    .eq("id", notaId)
    .is("entrada_em", null);

  // Valor do boleto informado (custas/juros/desconto) volta a valer depois de
  // lançar — a diferença entra como lançamento à parte, sem sujar o CMV.
  await aplicarValorBoletoNota(supabase, notaId);

  // Toda compra que entra atualiza o preço de referência do produto
  // (usado nas contagens/CMV e nas próximas cotações).
  const { data: itensRef } = await supabase
    .from("nota_itens")
    .select("produto_id, valor_unit, fator, destino")
    .eq("nota_id", notaId);
  for (const i of (itensRef as { produto_id: string | null; valor_unit: number | null; fator: number | null; destino: string | null }[]) ?? []) {
    if (i.produto_id && !i.destino && i.valor_unit != null && Number(i.valor_unit) > 0) {
      // Nota em caixa (fator > 1) → preço por UNIDADE do produto.
      const fator = Number(i.fator) > 0 ? Number(i.fator) : 1;
      await supabase
        .from("produtos")
        .update({ preco_referencia: Math.round((Number(i.valor_unit) / fator) * 10000) / 10000 })
        .eq("id", i.produto_id);
    }
  }

  revalidatePath("/notas");
  revalidatePath("/financeiro/contas");
  revalidatePath("/produtos");
  return { ok: true };
}

// Valor cobrado no boleto (com custas/juros do banco) — quase sempre diferente
// do valor da nota. Fica guardado na nota e, se ela já estiver lançada, a
// diferença já entra como lançamento à parte em "Despesas Bancárias".
export async function definirValorBoleto(notaId: string, valor: number | null) {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  const { data: nota } = await supabase
    .from("notas_fiscais")
    .select("valor, situacao")
    .eq("id", notaId)
    .maybeSingle();
  if (!nota) return { ok: false, erro: "Nota não encontrada." };

  const v = valor && valor > 0 ? Math.round(valor * 100) / 100 : null;
  await supabase
    .from("notas_fiscais")
    .update({ valor_boleto: v })
    .eq("id", notaId);

  let erro: string | undefined;
  if ((nota as { situacao?: string }).situacao === "lancada") {
    const { data: lancData } = await supabase
      .from("lancamentos")
      .select("id, vencimento")
      .eq("nota_id", notaId);
    const lancs = (lancData as { id: string; vencimento: string | null }[]) ?? [];
    const vencimentos = new Set(lancs.map((l) => l.vencimento ?? ""));
    if (lancs.length === 0) {
      erro = "Nota sem lançamento no financeiro.";
    } else if (vencimentos.size > 1) {
      erro = "Nota parcelada: ajuste o valor de cada boleto em Contas a pagar.";
    } else {
      const r = await ajustarTotalBoleto(
        supabase,
        lancs.map((l) => l.id),
        v ?? Number(nota.valor),
      );
      erro = r.erro;
    }
  }

  revalidatePath(`/notas/${notaId}`);
  revalidatePath("/notas");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
  return { ok: !erro, erro };
}

// Marca a nota como mercadoria ou serviço.
export async function definirTipoNota(notaId: string, tipo: string) {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  await supabase
    .from("notas_fiscais")
    .update({ tipo: tipo === "servico" ? "servico" : "mercadoria" })
    .eq("id", notaId);
  revalidatePath(`/notas/${notaId}`);
  return { ok: true };
}

// Padrão do fornecedor (categoria DRE / tipo de nota) → preenche a nota que
// ainda não tem esses campos. Chamado ao vincular e ao importar.
async function aplicarPadraoFornecedor(supabase: SupabaseClient, notaId: string, fornecedorId: string | null) {
  if (!fornecedorId) return;
  const [{ data: f }, { data: n }] = await Promise.all([
    supabase.from("fornecedores").select("dre_categoria_id, tipo_nota").eq("id", fornecedorId).maybeSingle(),
    supabase.from("notas_fiscais").select("dre_categoria_id, tipo, situacao").eq("id", notaId).maybeSingle(),
  ]);
  if (!f || !n || n.situacao === "lancada") return;
  const patch: Record<string, string> = {};
  if (f.dre_categoria_id && !n.dre_categoria_id) patch.dre_categoria_id = f.dre_categoria_id as string;
  if (f.tipo_nota && n.tipo !== f.tipo_nota) patch.tipo = f.tipo_nota as string;
  if (Object.keys(patch).length) await supabase.from("notas_fiscais").update(patch).eq("id", notaId);
}

// Define a categoria de despesa (DRE) de uma nota de serviço.
// salvarNoFornecedor: grava também como padrão do fornecedor da nota.
export async function definirCategoriaNota(
  notaId: string,
  categoriaId: string | null,
  salvarNoFornecedor = false,
) {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  await supabase
    .from("notas_fiscais")
    .update({ dre_categoria_id: categoriaId || null })
    .eq("id", notaId);
  if (salvarNoFornecedor && categoriaId) {
    const { data: n } = await supabase.from("notas_fiscais").select("fornecedor_id, tipo").eq("id", notaId).maybeSingle();
    if (n?.fornecedor_id) {
      await supabase
        .from("fornecedores")
        .update({ dre_categoria_id: categoriaId, tipo_nota: n.tipo === "servico" ? "servico" : "mercadoria" })
        .eq("id", n.fornecedor_id);
      revalidatePath("/fornecedores");
    }
  }
  revalidatePath(`/notas/${notaId}`);
  return { ok: true };
}

// Cria um fornecedor novo (com o nome/CNPJ da nota) e já vincula à nota.
export async function criarEVincularFornecedor(
  notaId: string,
  nome: string,
  cnpj: string | null,
) {
  await exigirAcesso("/notas");
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

// Dia em que a mercadoria da nota deu entrada (a contagem soma "o que chegou"
// por esta data). Guarda ao meio-dia de Brasília: entrou "no dia", sem hora.
export async function definirEntradaNota(notaId: string, dia: string) {
  await exigirAcesso("/notas");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { ok: false, erro: "Data inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notas_fiscais")
    .update({ entrada_em: `${dia}T12:00:00-03:00` })
    .eq("id", notaId);
  if (error) return { ok: false, erro: explicarErro(error) };
  revalidatePath(`/notas/${notaId}`);
  return { ok: true };
}

// Vincula um item da nota a um produto do sistema (para o CMV detalhado).
export async function vincularItemProduto(
  itemId: string,
  produtoId: string | null,
) {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  await supabase
    .from("nota_itens")
    .update({ produto_id: produtoId })
    .eq("id", itemId);
  await recalcularDoItemNota(supabase as unknown as DbConf, itemId);
  // Fator sugerido, só se ainda estiver em 1:
  // 1) o que a casa usou da última vez pra este mesmo item deste fornecedor
  //    com este produto (a nota "lembra" o por un.: pedido de 08/10/2026);
  // 2) senão, nota em CX/FD/PCT e produto com "fardo" cadastrado → fardo.
  if (produtoId) {
    const [{ data: it }, { data: prod }] = await Promise.all([
      supabase.from("nota_itens").select("nota_id, descricao, unidade, fator, notas_fiscais(emit_cnpj)").eq("id", itemId).maybeSingle(),
      supabase.from("produtos").select("fardo").eq("id", produtoId).maybeSingle(),
    ]);
    if (Number(it?.fator ?? 1) <= 1) {
      const nf = it?.notas_fiscais as { emit_cnpj?: string | null } | { emit_cnpj?: string | null }[] | null;
      const cnpj = (Array.isArray(nf) ? nf[0]?.emit_cnpj : nf?.emit_cnpj) ?? null;
      let fator = 0;
      if (cnpj && it?.descricao) {
        const { data: ant } = await supabase
          .from("nota_itens")
          .select("fator, descricao, notas_fiscais!inner(emit_cnpj, situacao, data_emissao)")
          .eq("produto_id", produtoId)
          .eq("notas_fiscais.emit_cnpj", cnpj)
          .neq("id", itemId)
          .limit(200);
        const desc = String(it.descricao).trim().toLowerCase();
        type NF = { situacao?: string | null; data_emissao?: string | null };
        type Ant = { fator: number | null; descricao: string | null; notas_fiscais: NF | NF[] | null };
        const nfDe = (r: Ant) => (Array.isArray(r.notas_fiscais) ? r.notas_fiscais[0] : r.notas_fiscais) ?? {};
        // A ligação mais recente (ordenar pela nota embutida no PostgREST só
        // reordena o embutido, não as linhas; ordena aqui).
        const igual = ((ant as unknown as Ant[]) ?? [])
          .filter((r) => String(r.descricao ?? "").trim().toLowerCase() === desc && nfDe(r).situacao !== "cancelada")
          .sort((x, y) => String(nfDe(y).data_emissao ?? "").localeCompare(String(nfDe(x).data_emissao ?? "")))[0];
        if (igual && Number(igual.fator) > 0 && Number(igual.fator) !== 1) fator = Number(igual.fator);
      }
      if (!fator) {
        const un = String(it?.unidade ?? "").toUpperCase().trim();
        const fardo = Number(prod?.fardo ?? 0);
        if (fardo > 1 && ["CX", "CXA", "FD", "FDO", "PCT", "PC", "SC", "ENG", "DZ", "PACK", "CJ"].includes(un)) fator = fardo;
      }
      if (fator) {
        await supabase.from("nota_itens").update({ fator }).eq("id", itemId);
        await recalcularDoItemNota(supabase as unknown as DbConf, itemId);
      }
    }
  }
  return { ok: true };
}

// Unidade em que o produto entra no estoque (kg, un, L...), ajustável direto na
// nota: é ali que se percebe que "vem em caixa" mas se conta em quilo.
export async function definirUnidadeProduto(produtoId: string, unidade: string) {
  await exigirAcesso("/notas");
  const u = String(unidade ?? "").trim().slice(0, 12);
  if (!u) return { ok: false };
  const supabase = await createClient();
  await supabase.from("produtos").update({ unidade: u }).eq("id", produtoId);
  revalidatePath("/produtos");
  return { ok: true };
}

// Fator de conversão do item: quantas unidades do produto por unidade da nota.
// Se a nota já estiver lançada, refaz o preço de referência do produto.
export async function definirFatorItemNota(itemId: string, fator: number) {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  // 6 casas: com o total digitado (100 un em 3 fardos) o fator é 33,333…
  const f = Number(fator) > 0 ? Math.round(Number(fator) * 1e6) / 1e6 : 1;
  const { data: it } = await supabase
    .from("nota_itens")
    .select("nota_id, produto_id, valor_unit, notas_fiscais(situacao)")
    .eq("id", itemId)
    .maybeSingle();
  await supabase.from("nota_itens").update({ fator: f }).eq("id", itemId);
  const nf = it?.notas_fiscais as { situacao?: string } | { situacao?: string }[] | null;
  const situacao = Array.isArray(nf) ? nf[0]?.situacao : nf?.situacao;
  if (it?.produto_id && situacao === "lancada" && Number(it.valor_unit) > 0) {
    await supabase
      .from("produtos")
      .update({ preco_referencia: Math.round((Number(it.valor_unit) / f) * 10000) / 10000 })
      .eq("id", it.produto_id);
  }
  await recalcularDoItemNota(supabase as unknown as DbConf, itemId);
  if (it?.nota_id) revalidatePath(`/notas/${it.nota_id}`);
  return { ok: true, fator: f };
}

// Tira as contas da nota e muda a situação dela. Recusa se alguma parcela já foi
// paga: apagar a conta paga sumia com o pagamento do financeiro e da conciliação
// (ACE-02). Quem precisa mesmo estornar desfaz o pagamento no Contas a pagar antes.
async function tirarContasDaNota(
  notaId: string,
  situacao: "pendente" | "cancelada",
): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  const { data: pagas, error: errLer } = await supabase
    .from("lancamentos")
    .select("valor")
    .eq("nota_id", notaId)
    .eq("pago", true);
  if (errLer) return { ok: false, mensagem: "Não consegui conferir as parcelas da nota. Tente de novo." };
  if (pagas && pagas.length > 0) {
    const total = pagas.reduce((s, l) => s + Number(l.valor || 0), 0);
    return {
      ok: false,
      mensagem: `Esta nota tem ${pagas.length} parcela(s) já paga(s) (${moedaBR(total)}). Desfaça o pagamento no Contas a pagar antes.`,
    };
  }
  const { error: errApagar } = await supabase.from("lancamentos").delete().eq("nota_id", notaId);
  if (errApagar) return { ok: false, mensagem: "Não consegui tirar as contas da nota. Nada foi mudado." };
  const { error: errNota } = await supabase
    .from("notas_fiscais")
    .update({ situacao })
    .eq("id", notaId);
  if (errNota) return { ok: false, mensagem: "As contas saíram, mas a nota não mudou de situação. Tente de novo." };
  revalidatePath("/notas");
  revalidatePath("/financeiro/contas");
  return { ok: true };
}

// Estorna a nota lançada: remove a conta e volta para pendente (pode relançar).
export async function estornarNota(notaId: string) {
  return tirarContasDaNota(notaId, "pendente");
}

// Marca a nota como cancelada e remove qualquer conta gerada por ela.
export async function cancelarNota(notaId: string) {
  return tirarContasDaNota(notaId, "cancelada");
}

// Vincula (concilia) a nota a um pedido; remove o lançamento provisório do pedido.
export async function vincularPedido(notaId: string, pedidoId: string | null) {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  // Regra compartilhada com a tela de conferência (src/lib/conferencia-core.ts):
  // liga/desliga, tira a conta provisória do pedido e recalcula as divergências.
  await ligarNotaAoPedido(supabase as unknown as DbConf, notaId, pedidoId);
  revalidatePath(`/notas/${notaId}`);
  revalidatePath("/financeiro/contas");
  revalidatePath("/conferencia");
}

export async function excluirNota(formData: FormData) {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("lancamentos").delete().eq("nota_id", id);
  await supabase.from("notas_fiscais").delete().eq("id", id);
  revalidatePath("/notas");
  revalidatePath("/financeiro/contas");
}

// Item da nota que não é da casa (migration 0243): "socios" (Ana e Rafa) ou
// "funcionario" (vira Compra interna da pessoa, pra descontar no acerto).
// Sai do estoque, do CMV, do preço de referência e da conferência; no
// financeiro cai em "Consumo dos sócios" / "Outras despesas com pessoal"
// quando a nota é lançada.
export async function definirDestinoItemNota(
  itemId: string,
  destino: "socios" | "funcionario" | null,
  colaboradorId?: string | null,
) {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  const { data: it } = await supabase
    .from("nota_itens")
    .select("id, nota_id, descricao, valor_total, destino_retirada_id, notas_fiscais(numero, emit_nome, situacao)")
    .eq("id", itemId)
    .maybeSingle();
  if (!it) return { ok: false as const, mensagem: "Item não encontrado." };
  if (destino === "funcionario" && !colaboradorId) return { ok: false as const, mensagem: "Escolha o funcionário." };
  const nf = (Array.isArray(it.notas_fiscais) ? it.notas_fiscais[0] : it.notas_fiscais) as { numero?: string | null; emit_nome?: string | null; situacao?: string | null } | null;

  // A Compra interna de antes sai — se ainda não foi acertada.
  if (it.destino_retirada_id) {
    const { data: ret } = await supabase.from("retiradas").select("status").eq("id", it.destino_retirada_id).maybeSingle();
    if (ret && ret.status !== "aberto") {
      return { ok: false as const, mensagem: "A Compra interna desse item já foi acertada com o funcionário. Ajuste por Compras internas." };
    }
    await supabase.from("retiradas").delete().eq("id", it.destino_retirada_id);
  }

  let retiradaId: number | null = null;
  if (destino === "funcionario" && colaboradorId) {
    const { data: col } = await supabase.from("colaboradores").select("nome, ativo").eq("id", colaboradorId).maybeSingle();
    if (!col || !col.ativo) return { ok: false as const, mensagem: "Funcionário não encontrado (ou desligado)." };
    const { data: userEq } = await supabase.auth.getUser();
    const { data: ret, error } = await supabase
      .from("retiradas")
      .insert({
        colaborador_id: colaboradorId,
        nome: col.nome as string,
        item: `${String(it.descricao ?? "Item").slice(0, 80)} (NF ${nf?.numero ?? ""})`,
        valor: Math.round(Number(it.valor_total ?? 0) * 100) / 100,
        data: hojeSP(),
        status: "aberto",
        observacao: `Comprado junto na nota de ${nf?.emit_nome ?? "fornecedor"}`.slice(0, 200),
        criado_por: userEq.user?.id ?? null,
      })
      .select("id")
      .single();
    if (error) return { ok: false as const, mensagem: `Não lancei a Compra interna: ${error.message}` };
    retiradaId = Number((ret as { id: number }).id);
  }

  const { error } = await supabase
    .from("nota_itens")
    .update({ destino, destino_colaborador_id: destino === "funcionario" ? colaboradorId : null, destino_retirada_id: retiradaId })
    .eq("id", itemId);
  if (error) return { ok: false as const, mensagem: explicarErro(error) };
  revalidatePath(`/notas/${it.nota_id}`);
  revalidatePath("/retiradas");
  return { ok: true as const, notaLancada: nf?.situacao === "lancada" };
}

// Tamanho lido na descrição da nota ("1,04KG") que ainda não está no cadastro
// do produto com vários tamanhos (migration 0245): guarda com um toque.
export async function adicionarTamanhoProduto(produtoId: string, tamanho: number) {
  await exigirAcesso("/notas");
  if (!(tamanho > 0)) return { ok: false as const };
  const supabase = await createClient();
  const { data: p } = await supabase.from("produtos").select("tamanhos").eq("id", produtoId).maybeSingle();
  const atuais = ((p?.tamanhos as number[] | null) ?? []).map(Number);
  if (atuais.some((t) => Math.abs(t - tamanho) < 0.0001)) return { ok: true as const };
  const novos = [...atuais, Math.round(tamanho * 10000) / 10000].sort((a, b) => a - b);
  const { error } = await supabase.from("produtos").update({ tamanhos: novos }).eq("id", produtoId);
  revalidatePath("/produtos");
  return error ? { ok: false as const } : { ok: true as const };
}

// ── Rascunho à mão (fruteira paga em dinheiro, sem nota) ─────────────────────
// Pedido do Rafael, 23/11/2026. A foto da folha vai pra IA, a pessoa confere as
// linhas na tela e a compra entra em Notas como nota PENDENTE (modelo
// "rascunho", chave inventada só pra ser única). Daí pra frente é igual: liga
// os produtos, lança no financeiro e entra no CMV/preço de referência.

const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Fornecedores pra escolher de quem é o rascunho (ativos primeiro). */
export async function fornecedoresDoRascunho() {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  const forns = await buscarTodas<{ id: string; nome: string; ativo: boolean }>((de, ate) =>
    supabase.from("fornecedores").select("id, nome, ativo").order("nome").range(de, ate),
  );
  return {
    ia: iaConfigurada(),
    fornecedores: forns
      .sort((a, b) => Number(b.ativo) - Number(a.ativo))
      .map((f) => ({ id: f.id, nome: f.ativo ? f.nome : `${f.nome} (inativo)` })),
  };
}

/** Lê as fotos (folhas) de UM rascunho com a IA, numa leitura só. Não grava nada. */
export async function lerRascunhoFoto(formData: FormData): Promise<{ ok: true; leitura: LeituraRascunho } | { ok: false; erro: string }> {
  await exigirAcesso("/notas");
  if (!iaConfigurada()) return { ok: false, erro: "A leitura por IA ainda não está ligada neste sistema." };
  const fotos = formData.getAll("foto").filter((f): f is File => f instanceof File && f.size > 0);
  if (fotos.length === 0) return { ok: false, erro: "Escolha a foto do rascunho." };
  if (fotos.length > 4) return { ok: false, erro: "Mande no máximo 4 folhas por rascunho." };
  if (fotos.some((f) => !(TIPOS_FOTO as readonly string[]).includes(f.type))) return { ok: false, erro: "Mande as fotos em JPG ou PNG." };
  if (fotos.some((f) => f.size > 4_500_000)) return { ok: false, erro: "Foto grande demais. Tire de novo ou mande menor." };
  const [{ user }, perfil] = await Promise.all([usuarioDaSessao(), perfilDaSessao()]);
  const empresaId = perfil?.empresa_id as string | undefined;
  if (!empresaId) return { ok: false, erro: "Seu login não está ligado a uma empresa." };

  const supabase = await createClient();
  const prods = await buscarTodas<{ nome: string }>((de, ate) =>
    supabase.from("produtos").select("nome").eq("ativo", true).order("nome").range(de, ate),
  );
  const nomes = [...new Set(prods.map((p) => (p.nome ?? "").trim()).filter(Boolean))];
  try {
    const imagens = await Promise.all(
      fotos.map(async (f) => ({ base64: Buffer.from(await f.arrayBuffer()).toString("base64"), tipo: f.type as (typeof TIPOS_FOTO)[number] })),
    );
    const leitura = await lerRascunho(imagens, nomes, { empresaId, userId: user?.id ?? null });
    if (leitura.linhas.length === 0) return { ok: false, erro: "Não achei nenhuma linha de produto nas fotos. Tire de novo, de cima e com luz." };
    return { ok: true, leitura };
  } catch {
    return { ok: false, erro: "A leitura não deu certo agora. Confira a internet e tente de novo." };
  }
}

/** Grava o rascunho conferido como nota pendente. */
export async function salvarRascunho(d: {
  fornecedorId: string;
  /** Segunda-feira da semana do rascunho (a fruteira manda um por semana). */
  semana: string;
  linhas: LinhaRascunho[];
}): Promise<{ ok: true; notaId: string } | { ok: false; erro: string }> {
  await exigirAcesso("/notas");
  if (!d.fornecedorId) return { ok: false, erro: "Escolha o fornecedor." };
  // A compra entra no CMV pela data de emissão: a segunda da semana põe o
  // rascunho na semana certa (o CMV é sempre segunda → domingo).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.semana ?? "") || new Date(`${d.semana}T12:00:00Z`).getUTCDay() !== 1) {
    return { ok: false, erro: "Escolha a semana do rascunho." };
  }
  if (d.semana > hojeSP()) return { ok: false, erro: "A semana não pode ser no futuro." };
  const linhas = (d.linhas ?? [])
    .map((l) => ({
      descricao: String(l.descricao ?? "").trim().slice(0, 120),
      produto: l.produto ? String(l.produto) : null,
      qtd: Math.round(Number(l.qtd) * 1000) / 1000,
      unidade: (UNIDADES_RASCUNHO as readonly string[]).includes(l.unidade) ? l.unidade : "UN",
      valor_unit: Math.round(Number(l.valor_unit) * 10000) / 10000,
      valor_total: Math.round(Number(l.valor_total) * 100) / 100,
    }))
    .filter((l) => l.descricao);
  if (linhas.length === 0) return { ok: false, erro: "Não tem nenhuma linha pra salvar." };
  const ruim = linhas.find((l) => !(l.qtd > 0) || !(l.valor_total > 0) || !(l.valor_unit >= 0));
  if (ruim) return { ok: false, erro: `Confira "${ruim.descricao}": quantidade e total têm que ser maiores que zero.` };
  const naoFecha = linhas.find((l) => !linhaFecha(l));
  if (naoFecha) return { ok: false, erro: `Em "${naoFecha.descricao}" quantidade × preço não dá o total. Corrija antes de salvar.` };

  const supabase = await createClient();
  const { data: forn } = await supabase.from("fornecedores").select("id, nome, cnpj").eq("id", d.fornecedorId).maybeSingle();
  const f = forn as { id: string; nome: string; cnpj: string | null } | null;
  if (!f) return { ok: false, erro: "Fornecedor não encontrado." };
  // O "aprendizado" da ligação item → produto (0205/0210) é por emit_cnpj:
  // sem CNPJ no cadastro, uma marca fixa por fornecedor faz o mesmo papel.
  const emitCnpj = soDigitos(f.cnpj ?? "") || `rascunho:${f.id}`;

  // Mesmo fornecedor, mesma semana e mesmo valor: provavelmente já foi lançado.
  const valor = Math.round(linhas.reduce((s, l) => s + l.valor_total, 0) * 100) / 100;
  const { data: igual } = await supabase
    .from("notas_fiscais")
    .select("id")
    .eq("modelo", MODELO_RASCUNHO)
    .eq("fornecedor_id", f.id)
    .eq("data_emissao", d.semana)
    .eq("valor", valor)
    .limit(1);
  if ((igual ?? []).length > 0) return { ok: false, erro: "Esse rascunho já entrou (mesmo fornecedor, semana e valor). Veja na lista de notas." };

  // Produto que a IA reconheceu pelo nome do cadastro.
  const nomesProd = [...new Set(linhas.map((l) => l.produto).filter((x): x is string => !!x))];
  const idPorNome = new Map<string, string>();
  if (nomesProd.length) {
    const { data: ps } = await supabase.from("produtos").select("id, nome").eq("ativo", true).in("nome", nomesProd);
    for (const p of (ps as { id: string; nome: string }[]) ?? []) idPorNome.set(p.nome, p.id);
  }

  const { data: nota, error } = await supabase
    .from("notas_fiscais")
    .insert({
      chave: `RASCUNHO-${crypto.randomUUID()}`,
      numero: `sem. ${d.semana.split("-").reverse().slice(0, 2).join("/")}`,
      serie: null,
      modelo: MODELO_RASCUNHO,
      emit_cnpj: emitCnpj,
      emit_nome: f.nome,
      valor,
      data_emissao: d.semana,
      vencimento: hojeSP(),
      fornecedor_id: f.id,
    })
    .select("id")
    .single();
  if (error || !nota) return { ok: false, erro: explicarErro(error, "Não consegui salvar o rascunho.") };

  const itens = await comProdutoVinculado(
    supabase,
    linhas.map((l, i) => ({
      cprod: String(i + 1),
      descricao: l.descricao,
      ncm: "",
      ean: "",
      unidade: l.unidade,
      qtd: l.qtd,
      valor_unit: l.valor_unit,
      valor_total: l.valor_total,
      produto_id: l.produto ? idPorNome.get(l.produto) ?? null : null,
    })),
    emitCnpj,
  );
  const { error: eItens } = await supabase.from("nota_itens").insert(itens.map((i) => ({ ...i, nota_id: nota.id })));
  if (eItens) {
    await supabase.from("notas_fiscais").delete().eq("id", nota.id);
    return { ok: false, erro: explicarErro(eItens, "Não consegui salvar os itens do rascunho.") };
  }
  await aplicarPadraoFornecedor(supabase, nota.id, f.id);
  revalidatePath("/notas");
  return { ok: true, notaId: nota.id as string };
}
