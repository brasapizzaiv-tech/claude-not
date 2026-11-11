// Regras do Cofre (migration 0269), as mesmas no painel e no app da equipe.
// Quem chama confere a permissão antes e diz o banco, a empresa e o nome de quem
// está fazendo. O app usa a chave administrativa, que passa por cima das regras
// do banco, então toda consulta aqui filtra pela empresa.
import { buscarTodas } from "@/lib/supabase/todas";
import { categoriasDeSangria } from "@/lib/sangria-financeiro";
import { contagemDoCaixa, limpar, negar, valorDe, TIPOS, type DadosCofre, type MovimentoNovo, type Pendente, type Quantidades } from "@/lib/cofre";
import type { createClient } from "@/lib/supabase/server";
import { explicarErro } from "@/lib/erro-amigavel";
import { moedaBR } from "@/lib/format";

export type Db = Awaited<ReturnType<typeof createClient>>;
export type Ctx = { db: Db; empresaId: string; quem: string | null };

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Saldo atual por nota/moeda (soma das movimentações da empresa). */
export async function saldoAtual({ db, empresaId }: Ctx): Promise<Quantidades> {
  const movs = await buscarTodas<{ quantidades: Quantidades | null }>((de, ate) =>
    db.from("cofre_movimentos").select("quantidades").eq("empresa_id", empresaId).order("id").range(de, ate),
  );
  const out: Quantidades = {};
  for (const m of movs) {
    for (const [k, v] of Object.entries(m.quantidades ?? {})) out[k] = (out[k] ?? 0) + Number(v);
  }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

/** Saída que deixaria alguma nota/moeda negativa no cofre. */
function faltaNoCofre(saldo: Quantidades, mov: Quantidades) {
  return Object.entries(mov).filter(([k, v]) => v < 0 && (saldo[k] ?? 0) + v < 0).map(([k]) => Number(k));
}

/** Tudo o que a tela do Cofre mostra. */
export async function carregarDados(ctx: Ctx): Promise<DadosCofre> {
  const { db, empresaId } = ctx;
  const [{ data: faixasRows }, saldo, { data: cfg }, { data: pedidosRows }, { data: movRows }, categorias] = await Promise.all([
    db.from("cofre_denominacoes").select("centavos, minimo, maximo").eq("empresa_id", empresaId),
    saldoAtual(ctx),
    db.from("cofre_config").select("inicio_em").eq("empresa_id", empresaId).maybeSingle(),
    db.from("cofre_pedidos").select("id, quantidades, valor, obs, criado_por_nome, criado_em").eq("empresa_id", empresaId).eq("status", "encomendado").order("criado_em"),
    db.from("cofre_movimentos").select("id, tipo, quantidades, valor, esperado, descricao, criado_por_nome, criado_em").eq("empresa_id", empresaId).order("criado_em", { ascending: false }).limit(60),
    categoriasDeSangria(db, empresaId),
  ]);

  const faixas: DadosCofre["faixas"] = {};
  for (const r of (faixasRows as { centavos: number; minimo: number; maximo: number }[] | null) ?? []) faixas[String(r.centavos)] = { minimo: r.minimo, maximo: r.maximo };

  // O que saiu dos caixas e ainda não entrou no cofre (só depois do saldo inicial).
  const inicio = (cfg as { inicio_em: string | null } | null)?.inicio_em ?? null;
  const pendentes: Pendente[] = [];
  if (inicio) {
    const [{ data: fechados }, { data: abertos }, { data: sangrias }, { data: jaFeitos }] = await Promise.all([
      db.from("pdv_caixas").select("id, nome, aberto_em, fechado_em, dinheiro_contado, dinheiro_esperado, resumo").eq("empresa_id", empresaId).eq("status", "fechado").gte("fechado_em", inicio).order("fechado_em").limit(60),
      db.from("pdv_caixas").select("id, nome, aberto_em, saldo_inicial, abertura_notas").eq("empresa_id", empresaId).gte("aberto_em", inicio).gt("saldo_inicial", 0).order("aberto_em").limit(60),
      db.from("pdv_caixa_mov").select("id, valor, descricao, criado_em").eq("empresa_id", empresaId).eq("tipo", "sangria").is("lancamento_id", null).gte("criado_em", inicio).order("criado_em").limit(100),
      db.from("cofre_movimentos").select("origem_tipo, origem_id").eq("empresa_id", empresaId).not("origem_id", "is", null).gte("criado_em", inicio).limit(1000),
    ]);
    const feito = new Set(((jaFeitos as { origem_tipo: string; origem_id: string }[] | null) ?? []).map((m) => `${m.origem_tipo}:${m.origem_id}`));
    for (const c of (abertos as { id: string; nome: string | null; aberto_em: string; saldo_inicial: number; abertura_notas: Quantidades | null }[] | null) ?? []) {
      if (feito.has(`abertura:${c.id}`)) continue;
      // Troco contado nota por nota na abertura: a saída já vem preenchida.
      pendentes.push({ origem: { tipo: "abertura", id: c.id, esperado: Number(c.saldo_inicial) }, tipo: "fundo_caixa", quando: c.aberto_em, rotulo: `Troco pra abrir o caixa (${hora(c.aberto_em)})`, valor: Number(c.saldo_inicial), sai: true, contagem: contagemDoCaixa({ notas: c.abertura_notas }, Number(c.saldo_inicial)) });
    }
    for (const c of (fechados as { id: string; nome: string | null; fechado_em: string; dinheiro_contado: number | null; dinheiro_esperado: number | null; resumo: { notas?: Quantidades | null } | null }[] | null) ?? []) {
      if (feito.has(`caixa:${c.id}`)) continue;
      const v = Number(c.dinheiro_contado ?? c.dinheiro_esperado ?? 0);
      if (v <= 0) continue;
      pendentes.push({ origem: { tipo: "caixa", id: c.id, esperado: v }, tipo: "entrada_caixa", quando: c.fechado_em, rotulo: `Dinheiro do caixa fechado em ${hora(c.fechado_em)}`, valor: v, sai: false, contagem: contagemDoCaixa(c.resumo, v) });
    }
    for (const s of (sangrias as { id: string; valor: number; descricao: string | null; criado_em: string }[] | null) ?? []) {
      if (feito.has(`sangria:${s.id}`)) continue;
      pendentes.push({ origem: { tipo: "sangria", id: s.id, esperado: Number(s.valor) }, tipo: "sangria", quando: s.criado_em, rotulo: `Sangria de ${hora(s.criado_em)}${s.descricao ? ` · ${s.descricao}` : ""}`, valor: Number(s.valor), sai: false });
    }
    pendentes.sort((a, b) => a.quando.localeCompare(b.quando));
  }

  return {
    iniciado: !!inicio,
    saldo,
    faixas,
    pendentes,
    pedidos: ((pedidosRows as { id: string; quantidades: Quantidades; valor: number; obs: string | null; criado_por_nome: string | null; criado_em: string }[] | null) ?? []).map((p) => ({ ...p, quando: hora(p.criado_em) })),
    movimentos: ((movRows as { id: string; tipo: string; quantidades: Quantidades; valor: number; esperado: number | null; descricao: string | null; criado_por_nome: string | null; criado_em: string }[] | null) ?? []).map((m) => ({ ...m, quando: hora(m.criado_em) })),
    categorias: categorias.map((c) => ({ id: c.id, nome: c.nome })),
  };
}

/** Entrada, saída ou troca. `quantidades` vêm POSITIVAS da tela; o sentido do
 *  tipo decide o sinal (troca e "outro" já vêm com sinal). */
export async function registrarMovimento(ctx: Ctx, d: MovimentoNovo) {
  const { db, empresaId, quem } = ctx;
  const t = TIPOS[d.tipo];
  if (!t || d.tipo === "contagem" || d.tipo === "pagamento") return { ok: false as const, mensagem: "Tipo de movimento inválido." };
  let q = limpar(d.quantidades);
  if (t.sentido === 1) q = limpar(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, Math.abs(v)])));
  if (t.sentido === -1) q = limpar(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, -Math.abs(v)])));
  if (Object.keys(q).length === 0) return { ok: false as const, mensagem: "Coloque a quantidade de pelo menos uma nota ou moeda." };
  const valor = valorDe(q);
  if (d.tipo === "troca" && Math.abs(valor) > 0.001) return { ok: false as const, mensagem: `Na troca, o que sai e o que entra têm que dar o mesmo valor (diferença de ${moedaBR(valor)}).` };
  const saldo = await saldoAtual(ctx);
  const falta = faltaNoCofre(saldo, q);
  if (falta.length) return { ok: false as const, mensagem: "Não tem essa quantidade no cofre. Confira as notas/moedas que saem (ou faça a conferência do cofre antes)." };
  const { data: mov, error } = await db.from("cofre_movimentos").insert({
    empresa_id: empresaId,
    tipo: d.tipo, quantidades: q, valor,
    esperado: d.origem?.esperado ?? null,
    descricao: (d.descricao ?? "").trim().slice(0, 200) || null,
    origem_tipo: d.origem?.tipo ?? null, origem_id: d.origem?.id ?? null,
    pedido_id: d.pedidoId ?? null,
    criado_por_nome: quem,
  }).select("id").single();
  if (error) return { ok: false as const, mensagem: error.code === "23505" ? "Esse dinheiro já foi registrado no cofre." : error.message };
  if (d.pedidoId) await db.from("cofre_pedidos").update({ status: "chegou", chegou_em: new Date().toISOString(), movimento_id: mov.id }).eq("id", d.pedidoId).eq("empresa_id", empresaId);
  return { ok: true as const };
}

/** Conta paga com dinheiro do cofre: dá baixa numa conta aberta do Contas a
 *  Pagar ou cria a conta já paga (origem 'cofre'). */
export async function pagarConta(ctx: Ctx, d: { quantidades: Quantidades; descricao: string; categoriaId?: string | null; lancamentoId?: string | null }) {
  const { db, empresaId, quem } = ctx;
  const q = negar(limpar(Object.fromEntries(Object.entries(d.quantidades).map(([k, v]) => [k, Math.abs(Number(v))]))));
  if (Object.keys(q).length === 0) return { ok: false as const, mensagem: "Coloque as notas/moedas que saíram do cofre." };
  const valor = -valorDe(q);
  const descricao = d.descricao.trim().slice(0, 200);
  if (!descricao) return { ok: false as const, mensagem: "Escreva o que foi pago." };
  const saldo = await saldoAtual(ctx);
  if (faltaNoCofre(saldo, q).length) return { ok: false as const, mensagem: "Não tem essa quantidade no cofre. Confira as notas/moedas que saíram." };
  const dia = hojeSP();
  let lancamentoId: string | null = null;
  if (d.lancamentoId) {
    const { data: l } = await db.from("lancamentos").select("id, valor, pago").eq("id", d.lancamentoId).eq("empresa_id", empresaId).maybeSingle();
    const conta = l as { id: string; valor: number; pago: boolean } | null;
    if (!conta) return { ok: false as const, mensagem: "Conta não encontrada no Contas a Pagar." };
    if (conta.pago) return { ok: false as const, mensagem: "Essa conta já está paga." };
    if (Math.abs(Number(conta.valor) - valor) > 0.009) return { ok: false as const, mensagem: `A conta é de ${moedaBR(Number(conta.valor))} e saíram ${moedaBR(valor)} do cofre. Confira as notas.` };
    const { error } = await db.from("lancamentos").update({ pago: true, pago_em: dia, forma_pagamento: "Dinheiro" }).eq("id", conta.id).eq("empresa_id", empresaId).eq("pago", false);
    if (error) return { ok: false as const, mensagem: explicarErro(error) };
    lancamentoId = conta.id;
  } else {
    if (!d.categoriaId) return { ok: false as const, mensagem: "Escolha a categoria (pra entrar certo no financeiro)." };
    const { data: l, error } = await db.from("lancamentos").insert({
      empresa_id: empresaId,
      data: dia, emissao: dia, vencimento: dia, pago: true, pago_em: dia,
      descricao: `Pago pelo cofre: ${descricao}`.slice(0, 200), categoria_id: d.categoriaId,
      valor, forma_pagamento: "Dinheiro", origem: "cofre",
    }).select("id").single();
    if (error || !l) return { ok: false as const, mensagem: explicarErro(error, "Não consegui criar a conta.") };
    lancamentoId = l.id as string;
  }
  const { error } = await db.from("cofre_movimentos").insert({
    empresa_id: empresaId,
    tipo: "pagamento", quantidades: q, valor: -valor, descricao, lancamento_id: lancamentoId, criado_por_nome: quem,
  });
  if (error) return { ok: false as const, mensagem: explicarErro(error) };
  return { ok: true as const };
}

/**
 * Saída de dinheiro do cofre ligada a uma conta (acerto da semana) ou a um
 * adiantamento. `quantidades` positivas = o que sai (o envelope). Confere o
 * saldo nota por nota antes.
 */
export async function sairDoCofre(
  ctx: Ctx,
  d: { quantidades: Quantidades; descricao: string; lancamentoId?: string | null; adiantamentoId?: string | null },
) {
  const { db, empresaId, quem } = ctx;
  const q = negar(limpar(Object.fromEntries(Object.entries(d.quantidades).map(([k, v]) => [k, Math.abs(Number(v))]))));
  if (Object.keys(q).length === 0) return { ok: true as const };
  const saldo = await saldoAtual(ctx);
  if (faltaNoCofre(saldo, q).length) return { ok: false as const, mensagem: "Não tem essas notas no cofre. Confira o envelope (ou faça a conferência do cofre)." };
  const { error } = await db.from("cofre_movimentos").insert({
    empresa_id: empresaId,
    tipo: "pagamento", quantidades: q, valor: valorDe(q), descricao: d.descricao.trim().slice(0, 200) || null,
    lancamento_id: d.lancamentoId ?? null, adiantamento_id: d.adiantamentoId ?? null, criado_por_nome: quem,
  });
  if (error) return { ok: false as const, mensagem: explicarErro(error) };
  return { ok: true as const };
}

/** O cofre já começou (primeira contagem feita)? Sem isso não há saldo pra tirar. */
export async function cofreIniciado({ db, empresaId }: Ctx) {
  const { data } = await db.from("cofre_config").select("inicio_em").eq("empresa_id", empresaId).maybeSingle();
  return !!(data as { inicio_em: string | null } | null)?.inicio_em;
}

/** Contas a pagar em aberto, buscadas no banco (nunca a tabela toda na tela). */
export async function buscarContasAbertas({ db, empresaId }: Ctx, termo: string) {
  let qy = db.from("lancamentos").select("id, descricao, valor, vencimento").eq("empresa_id", empresaId).eq("pago", false).gt("valor", 0).order("vencimento", { ascending: true }).limit(12);
  const t = termo.trim();
  if (t) {
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    qy = Number.isFinite(n) && n > 0 ? qy.eq("valor", n) : qy.ilike("descricao", `%${t}%`);
  }
  const { data } = await qy;
  return ((data as { id: string; descricao: string; valor: number; vencimento: string | null }[] | null) ?? []);
}

/** Conferência: o que foi contado vira o saldo; a diferença fica registrada.
 *  A primeira conferência é o saldo inicial e liga o controle. */
export async function conferirCofre(ctx: Ctx, d: { contado: Quantidades; motivo?: string }) {
  const { db, empresaId, quem } = ctx;
  const contado = limpar(d.contado);
  const saldo = await saldoAtual(ctx);
  const dif: Quantidades = {};
  for (const k of new Set([...Object.keys(saldo), ...Object.keys(contado)])) {
    const n = (contado[k] ?? 0) - (saldo[k] ?? 0);
    if (n) dif[k] = n;
  }
  const { data: cfg } = await db.from("cofre_config").select("inicio_em").eq("empresa_id", empresaId).maybeSingle();
  const primeira = !(cfg as { inicio_em: string | null } | null)?.inicio_em;
  if (!primeira && Object.keys(dif).length > 0 && !(d.motivo ?? "").trim()) return { ok: false as const, mensagem: "A contagem não bateu. Escreva o motivo da diferença." };
  if (Object.keys(dif).length > 0 || primeira) {
    const { error } = await db.from("cofre_movimentos").insert({
      empresa_id: empresaId,
      tipo: "contagem", quantidades: dif, valor: valorDe(dif),
      descricao: primeira ? "Saldo inicial do cofre" : (d.motivo ?? "").trim().slice(0, 200) || "Conferência sem diferença",
      criado_por_nome: quem,
    });
    if (error) return { ok: false as const, mensagem: explicarErro(error) };
  }
  if (primeira) await db.from("cofre_config").upsert({ empresa_id: empresaId, inicio_em: new Date().toISOString() });
  return { ok: true as const, diferenca: valorDe(dif) };
}

/** Mínimo e máximo de cada nota/moeda. */
export async function salvarFaixas({ db, empresaId }: Ctx, faixas: { centavos: number; minimo: number; maximo: number }[]) {
  const linhas = faixas
    .filter((f) => Number.isInteger(f.centavos) && f.centavos > 0)
    .map((f) => ({ empresa_id: empresaId, centavos: f.centavos, minimo: Math.max(0, Math.trunc(f.minimo || 0)), maximo: Math.max(0, Math.trunc(f.maximo || 0)) }));
  if (linhas.some((l) => l.maximo > 0 && l.minimo > l.maximo)) return { ok: false as const, mensagem: "O mínimo não pode ser maior que o máximo." };
  const { error } = await db.from("cofre_denominacoes").upsert(linhas, { onConflict: "empresa_id,centavos" });
  if (error) return { ok: false as const, mensagem: explicarErro(error) };
  return { ok: true as const };
}

/** Marca o troco como encomendado (a Ana encomenda). */
export async function marcarEncomenda({ db, empresaId, quem }: Ctx, d: { quantidades: Quantidades; obs?: string }) {
  const q = limpar(Object.fromEntries(Object.entries(d.quantidades).map(([k, v]) => [k, Math.abs(Number(v))])));
  if (Object.keys(q).length === 0) return { ok: false as const, mensagem: "Nada pra encomendar." };
  const { error } = await db.from("cofre_pedidos").insert({ empresa_id: empresaId, quantidades: q, valor: valorDe(q), obs: (d.obs ?? "").trim().slice(0, 200) || null, criado_por_nome: quem });
  if (error) return { ok: false as const, mensagem: explicarErro(error) };
  return { ok: true as const };
}

export async function cancelarEncomenda({ db, empresaId }: Ctx, id: string) {
  await db.from("cofre_pedidos").update({ status: "cancelado" }).eq("id", id).eq("empresa_id", empresaId).eq("status", "encomendado");
  return { ok: true as const };
}

/** Desfaz um movimento (errou a contagem). Se ele criou uma conta paga, apaga;
 *  se deu baixa numa conta, ela volta a ficar em aberto. */
export async function desfazerMovimento({ db, empresaId }: Ctx, id: string) {
  const { data: m } = await db.from("cofre_movimentos").select("id, tipo, lancamento_id, pedido_id, adiantamento_id").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
  const mov = m as { id: string; tipo: string; lancamento_id: string | null; pedido_id: string | null; adiantamento_id: string | null } | null;
  if (!mov) return { ok: false as const, mensagem: "Movimento não encontrado." };
  // Adiantamento pago pelo cofre: desfazer a saída = o adiantamento não foi dado.
  // Já descontado num acerto, não dá (o acerto já contou com ele).
  if (mov.adiantamento_id) {
    const { data: ad } = await db.from("adiantamentos").select("status").eq("id", mov.adiantamento_id).maybeSingle();
    const st = (ad as { status: string } | null)?.status;
    if (st && st !== "aberto") return { ok: false as const, mensagem: "Esse adiantamento já foi descontado num acerto da semana: não dá pra desfazer pelo cofre." };
    if (st) await db.from("adiantamentos").delete().eq("id", mov.adiantamento_id).eq("status", "aberto");
  }
  if (mov.lancamento_id) {
    const { data: l } = await db.from("lancamentos").select("origem").eq("id", mov.lancamento_id).eq("empresa_id", empresaId).maybeSingle();
    if ((l as { origem: string } | null)?.origem === "cofre") await db.from("lancamentos").delete().eq("id", mov.lancamento_id).eq("empresa_id", empresaId);
    else await db.from("lancamentos").update({ pago: false, pago_em: null }).eq("id", mov.lancamento_id).eq("empresa_id", empresaId);
  }
  if (mov.pedido_id) await db.from("cofre_pedidos").update({ status: "encomendado", chegou_em: null, movimento_id: null }).eq("id", mov.pedido_id).eq("empresa_id", empresaId);
  await db.from("cofre_movimentos").delete().eq("id", mov.id).eq("empresa_id", empresaId);
  return { ok: true as const };
}
