"use server";

// Cofre (migration 0269). Toda ação confere a permissão "cofre" e grava quem fez.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { limpar, negar, valorDe, TIPOS, type Quantidades } from "@/lib/cofre";

type Db = Awaited<ReturnType<typeof createClient>>;

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function quemSou(db: Db) {
  const { data: u } = await db.auth.getUser();
  if (!u.user) return null;
  const { data: p } = await db.from("profiles").select("nome").eq("id", u.user.id).maybeSingle();
  return ((p?.nome as string | null) || u.user.email || null);
}

/** Saldo atual por nota/moeda (soma das movimentações). */
async function saldoAtual(db: Db): Promise<Quantidades> {
  const { data } = await db.rpc("cofre_saldo");
  const out: Quantidades = {};
  for (const r of (data as { centavos: number; quantidade: number }[] | null) ?? []) if (Number(r.quantidade)) out[String(r.centavos)] = Number(r.quantidade);
  return out;
}

/** Saída que deixaria alguma nota/moeda negativa no cofre. */
function faltaNoCofre(saldo: Quantidades, mov: Quantidades) {
  return Object.entries(mov).filter(([k, v]) => v < 0 && (saldo[k] ?? 0) + v < 0).map(([k]) => Number(k));
}

type Origem = { tipo: "caixa" | "sangria" | "abertura"; id: string; esperado?: number | null };

/** Entrada, saída ou troca. `quantidades` vêm POSITIVAS da tela; o sentido do
 *  tipo decide o sinal (troca e "outro" já vêm com sinal). */
export async function registrarMovimento(d: { tipo: string; quantidades: Quantidades; descricao?: string; origem?: Origem | null; pedidoId?: string | null }) {
  await exigirAcesso("/cofre");
  const db = await createClient();
  const t = TIPOS[d.tipo];
  if (!t || d.tipo === "contagem" || d.tipo === "pagamento") return { ok: false as const, mensagem: "Tipo de movimento inválido." };
  let q = limpar(d.quantidades);
  if (t.sentido === 1) q = limpar(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, Math.abs(v)])));
  if (t.sentido === -1) q = limpar(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, -Math.abs(v)])));
  if (Object.keys(q).length === 0) return { ok: false as const, mensagem: "Coloque a quantidade de pelo menos uma nota ou moeda." };
  const valor = valorDe(q);
  if (d.tipo === "troca" && Math.abs(valor) > 0.001) return { ok: false as const, mensagem: `Na troca, o que sai e o que entra têm que dar o mesmo valor (diferença de R$ ${valor.toFixed(2).replace(".", ",")}).` };
  const saldo = await saldoAtual(db);
  const falta = faltaNoCofre(saldo, q);
  if (falta.length) return { ok: false as const, mensagem: "Não tem essa quantidade no cofre. Confira as notas/moedas que saem (ou faça a conferência do cofre antes)." };
  const { data: mov, error } = await db.from("cofre_movimentos").insert({
    tipo: d.tipo, quantidades: q, valor,
    esperado: d.origem?.esperado ?? null,
    descricao: (d.descricao ?? "").trim().slice(0, 200) || null,
    origem_tipo: d.origem?.tipo ?? null, origem_id: d.origem?.id ?? null,
    pedido_id: d.pedidoId ?? null,
    criado_por_nome: await quemSou(db),
  }).select("id").single();
  if (error) return { ok: false as const, mensagem: error.code === "23505" ? "Esse dinheiro já foi registrado no cofre." : error.message };
  if (d.pedidoId) await db.from("cofre_pedidos").update({ status: "chegou", chegou_em: new Date().toISOString(), movimento_id: mov.id }).eq("id", d.pedidoId);
  revalidatePath("/cofre");
  return { ok: true as const };
}

/** Conta paga com dinheiro do cofre: dá baixa numa conta aberta do Contas a
 *  Pagar ou cria a conta já paga (origem 'cofre'). */
export async function pagarConta(d: { quantidades: Quantidades; descricao: string; categoriaId?: string | null; lancamentoId?: string | null }) {
  await exigirAcesso("/cofre");
  const db = await createClient();
  const q = negar(limpar(Object.fromEntries(Object.entries(d.quantidades).map(([k, v]) => [k, Math.abs(Number(v))]))));
  if (Object.keys(q).length === 0) return { ok: false as const, mensagem: "Coloque as notas/moedas que saíram do cofre." };
  const valor = -valorDe(q);
  const descricao = d.descricao.trim().slice(0, 200);
  if (!descricao) return { ok: false as const, mensagem: "Escreva o que foi pago." };
  const saldo = await saldoAtual(db);
  if (faltaNoCofre(saldo, q).length) return { ok: false as const, mensagem: "Não tem essa quantidade no cofre. Confira as notas/moedas que saíram." };
  const dia = hojeSP();
  let lancamentoId: string | null = null;
  if (d.lancamentoId) {
    const { data: l } = await db.from("lancamentos").select("id, valor, pago").eq("id", d.lancamentoId).maybeSingle();
    const conta = l as { id: string; valor: number; pago: boolean } | null;
    if (!conta) return { ok: false as const, mensagem: "Conta não encontrada no Contas a Pagar." };
    if (conta.pago) return { ok: false as const, mensagem: "Essa conta já está paga." };
    if (Math.abs(Number(conta.valor) - valor) > 0.009) return { ok: false as const, mensagem: `A conta é de R$ ${Number(conta.valor).toFixed(2).replace(".", ",")} e saíram R$ ${valor.toFixed(2).replace(".", ",")} do cofre. Confira as notas.` };
    const { error } = await db.from("lancamentos").update({ pago: true, pago_em: dia, forma_pagamento: "Dinheiro" }).eq("id", conta.id).eq("pago", false);
    if (error) return { ok: false as const, mensagem: error.message };
    lancamentoId = conta.id;
  } else {
    if (!d.categoriaId) return { ok: false as const, mensagem: "Escolha a categoria (pra entrar certo no financeiro)." };
    const { data: l, error } = await db.from("lancamentos").insert({
      data: dia, emissao: dia, vencimento: dia, pago: true, pago_em: dia,
      descricao: `Pago pelo cofre: ${descricao}`.slice(0, 200), categoria_id: d.categoriaId,
      valor, forma_pagamento: "Dinheiro", origem: "cofre",
    }).select("id").single();
    if (error || !l) return { ok: false as const, mensagem: error?.message ?? "Não consegui criar a conta." };
    lancamentoId = l.id as string;
  }
  const { error } = await db.from("cofre_movimentos").insert({
    tipo: "pagamento", quantidades: q, valor: -valor, descricao, lancamento_id: lancamentoId, criado_por_nome: await quemSou(db),
  });
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/cofre");
  revalidatePath("/financeiro/contas");
  return { ok: true as const };
}

/** Contas a pagar em aberto, buscadas no banco (nunca a tabela toda na tela). */
export async function buscarContasAbertas(termo: string) {
  await exigirAcesso("/cofre");
  const db = await createClient();
  let qy = db.from("lancamentos").select("id, descricao, valor, vencimento").eq("pago", false).gt("valor", 0).order("vencimento", { ascending: true }).limit(12);
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
export async function conferirCofre(d: { contado: Quantidades; motivo?: string }) {
  await exigirAcesso("/cofre");
  const db = await createClient();
  const contado = limpar(d.contado);
  const saldo = await saldoAtual(db);
  const dif: Quantidades = {};
  for (const k of new Set([...Object.keys(saldo), ...Object.keys(contado)])) {
    const n = (contado[k] ?? 0) - (saldo[k] ?? 0);
    if (n) dif[k] = n;
  }
  const { data: cfg } = await db.from("cofre_config").select("inicio_em").maybeSingle();
  const primeira = !(cfg as { inicio_em: string | null } | null)?.inicio_em;
  if (!primeira && Object.keys(dif).length > 0 && !(d.motivo ?? "").trim()) return { ok: false as const, mensagem: "A contagem não bateu. Escreva o motivo da diferença." };
  if (Object.keys(dif).length > 0 || primeira) {
    const { error } = await db.from("cofre_movimentos").insert({
      tipo: "contagem", quantidades: dif, valor: valorDe(dif),
      descricao: primeira ? "Saldo inicial do cofre" : (d.motivo ?? "").trim().slice(0, 200) || "Conferência sem diferença",
      criado_por_nome: await quemSou(db),
    });
    if (error) return { ok: false as const, mensagem: error.message };
  }
  if (primeira) await db.from("cofre_config").upsert({ inicio_em: new Date().toISOString() });
  revalidatePath("/cofre");
  return { ok: true as const, diferenca: valorDe(dif) };
}

/** Mínimo e máximo de cada nota/moeda. */
export async function salvarFaixas(faixas: { centavos: number; minimo: number; maximo: number }[]) {
  await exigirAcesso("/cofre");
  const db = await createClient();
  const linhas = faixas
    .filter((f) => Number.isInteger(f.centavos) && f.centavos > 0)
    .map((f) => ({ centavos: f.centavos, minimo: Math.max(0, Math.trunc(f.minimo || 0)), maximo: Math.max(0, Math.trunc(f.maximo || 0)) }));
  if (linhas.some((l) => l.maximo > 0 && l.minimo > l.maximo)) return { ok: false as const, mensagem: "O mínimo não pode ser maior que o máximo." };
  const { error } = await db.from("cofre_denominacoes").upsert(linhas, { onConflict: "empresa_id,centavos" });
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/cofre");
  return { ok: true as const };
}

/** Marca o troco como encomendado (a Ana encomenda). */
export async function marcarEncomenda(d: { quantidades: Quantidades; obs?: string }) {
  await exigirAcesso("/cofre");
  const db = await createClient();
  const q = limpar(Object.fromEntries(Object.entries(d.quantidades).map(([k, v]) => [k, Math.abs(Number(v))])));
  if (Object.keys(q).length === 0) return { ok: false as const, mensagem: "Nada pra encomendar." };
  const { error } = await db.from("cofre_pedidos").insert({ quantidades: q, valor: valorDe(q), obs: (d.obs ?? "").trim().slice(0, 200) || null, criado_por_nome: await quemSou(db) });
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/cofre");
  return { ok: true as const };
}

export async function cancelarEncomenda(id: string) {
  await exigirAcesso("/cofre");
  const db = await createClient();
  await db.from("cofre_pedidos").update({ status: "cancelado" }).eq("id", id).eq("status", "encomendado");
  revalidatePath("/cofre");
  return { ok: true as const };
}

/** Desfaz um movimento (errou a contagem). Se ele criou uma conta paga, apaga;
 *  se deu baixa numa conta, ela volta a ficar em aberto. */
export async function desfazerMovimento(id: string) {
  await exigirAcesso("/cofre");
  const db = await createClient();
  const { data: m } = await db.from("cofre_movimentos").select("id, tipo, lancamento_id, pedido_id").eq("id", id).maybeSingle();
  const mov = m as { id: string; tipo: string; lancamento_id: string | null; pedido_id: string | null } | null;
  if (!mov) return { ok: false as const, mensagem: "Movimento não encontrado." };
  if (mov.lancamento_id) {
    const { data: l } = await db.from("lancamentos").select("origem").eq("id", mov.lancamento_id).maybeSingle();
    if ((l as { origem: string } | null)?.origem === "cofre") await db.from("lancamentos").delete().eq("id", mov.lancamento_id);
    else await db.from("lancamentos").update({ pago: false, pago_em: null }).eq("id", mov.lancamento_id);
  }
  if (mov.pedido_id) await db.from("cofre_pedidos").update({ status: "encomendado", chegou_em: null, movimento_id: null }).eq("id", mov.pedido_id);
  await db.from("cofre_movimentos").delete().eq("id", mov.id);
  revalidatePath("/cofre");
  return { ok: true as const };
}
