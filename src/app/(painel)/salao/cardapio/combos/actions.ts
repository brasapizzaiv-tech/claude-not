"use server";

// Combos em etapas (migration 0263), como no Suitable: o combo é um item do
// cardápio (combo = true, preço base 0) e cada etapa é um grupo de escolha com
// as opções e o "valor no combo" de cada uma. Só delivery e app do cliente:
// garçom e PDV não vendem combo.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function criarCombo(formData: FormData) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 100);
  if (!nome) return;
  // Categoria "Combo" (fora do garçom e do PDV) nasce na primeira vez. O combo
  // nasce indisponível: só aparece no app quando ligar, com as etapas prontas.
  const { data: cat } = await supabase.from("pdv_categorias").select("id").eq("nome", "Combo").maybeSingle();
  if (!cat) {
    const { data: max } = await supabase.from("pdv_categorias").select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
    await supabase.from("pdv_categorias").insert({ nome: "Combo", ordem: Number((max as { ordem?: number } | null)?.ordem ?? 0) + 1, canal_app: true, canal_garcom: false, canal_pdv: false });
  }
  const { data: item } = await supabase.from("pdv_itens").insert({
    nome, categoria: "Combo", preco: 0, combo: true, ativo: true, disponivel: false, delivery: true, canal_garcom: false, canal_pdv: false,
  }).select("id").single();
  revalidatePath("/salao/cardapio");
  if (item) redirect(`/salao/cardapio/combos/${(item as { id: string }).id}`);
}

// Detalhes e disponibilidade (dias e turnos, mesmo formato do cardápio).
export async function salvarDetalhesCombo(formData: FormData) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 100);
  if (!id || !nome) return;
  let horarios: unknown = null;
  const raw = String(formData.get("horarios") ?? "").trim();
  if (raw) {
    try {
      const p = JSON.parse(raw) as { dias?: number[]; turnos?: { ini: string; fim: string }[] };
      const dias = (Array.isArray(p.dias) ? p.dias : []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      const turnos = (Array.isArray(p.turnos) ? p.turnos : []).filter((t) => /^\d{2}:\d{2}$/.test(t?.ini ?? "") && /^\d{2}:\d{2}$/.test(t?.fim ?? "")).slice(0, 4);
      horarios = dias.length === 0 && turnos.length === 0 ? null : { dias, turnos };
    } catch { horarios = null; }
  }
  await supabase.from("pdv_itens").update({
    nome, descricao: String(formData.get("descricao") ?? "").trim().slice(0, 400) || null,
    disponivel: formData.get("disponivel") === "on", horarios,
  }).eq("id", id).eq("combo", true);
  revalidatePath(`/salao/cardapio/combos/${id}`);
  revalidatePath("/salao/cardapio");
}

export type OpcaoCombo = { id?: string; nome: string; preco: number; ativo: boolean; sabor_id?: string | null; produto_id?: string | null };
export type EtapaCombo = { id?: string; nome: string; min: number; max: number; permite_repetir: boolean; media: boolean; tamanho_id: string | null; opcoes: OpcaoCombo[] };

// Grava as etapas na ordem da tela. Etapa/opção que já existia mantém o id
// (carrinho aberto no app continua valendo); a que sumiu da tela é apagada.
export async function salvarEtapasCombo(itemId: string, etapas: EtapaCombo[]) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { data: item } = await supabase.from("pdv_itens").select("id").eq("id", itemId).eq("combo", true).maybeSingle();
  if (!item) return { ok: false as const, mensagem: "Combo não encontrado." };
  if (etapas.length === 0) return { ok: false as const, mensagem: "O combo precisa de pelo menos uma etapa." };
  for (const [i, e] of etapas.entries()) {
    if (!e.nome.trim()) return { ok: false as const, mensagem: `Dê um nome pra etapa ${i + 1}.` };
    if (e.opcoes.length === 0) return { ok: false as const, mensagem: `A etapa "${e.nome}" está sem opções.` };
    if (e.min < 0 || e.max < 1 || e.min > e.max) return { ok: false as const, mensagem: `Confira o "de … até …" da etapa "${e.nome}".` };
  }

  const { data: atuais } = await supabase.from("pdv_item_grupos").select("id").eq("item_id", itemId);
  const idsAtuais = new Set(((atuais as { id: string }[]) ?? []).map((g) => g.id));
  const mantidas = new Set<string>();
  let temPizza = false;
  for (const [ordem, e] of etapas.entries()) {
    const max = Math.min(20, Math.round(e.max)), min = Math.min(max, Math.max(0, Math.round(e.min)));
    const dados = { item_id: itemId, nome: e.nome.trim().slice(0, 100), min, max, permite_repetir: max > 1 && !!e.permite_repetir, media: !!e.media, tamanho_id: e.tamanho_id || null, ordem };
    let grupoId = e.id && idsAtuais.has(e.id) ? e.id : null;
    if (grupoId) await supabase.from("pdv_item_grupos").update(dados).eq("id", grupoId);
    else {
      const { data: g, error } = await supabase.from("pdv_item_grupos").insert(dados).select("id").single();
      if (error || !g) return { ok: false as const, mensagem: "Não consegui gravar a etapa. Tente de novo." };
      grupoId = (g as { id: string }).id;
    }
    mantidas.add(grupoId);
    if (e.media || e.opcoes.some((o) => o.sabor_id)) temPizza = true;

    const { data: opsAtuais } = await supabase.from("pdv_item_opcoes").select("id").eq("grupo_id", grupoId);
    const idsOps = new Set(((opsAtuais as { id: string }[]) ?? []).map((o) => o.id));
    const ficam = new Set<string>();
    const novas: Record<string, unknown>[] = [];
    for (const [oi, o] of e.opcoes.entries()) {
      const row = { grupo_id: grupoId, nome: o.nome.trim().slice(0, 100) || "Opção", preco: r2(Math.max(0, Number(o.preco) || 0)), ativo: o.ativo !== false, ordem: oi, sabor_id: o.sabor_id || null, produto_id: o.produto_id || null };
      if (o.id && idsOps.has(o.id)) { ficam.add(o.id); await supabase.from("pdv_item_opcoes").update(row).eq("id", o.id); }
      else novas.push(row);
    }
    if (novas.length) await supabase.from("pdv_item_opcoes").insert(novas);
    const sair = [...idsOps].filter((id) => !ficam.has(id));
    if (sair.length) await supabase.from("pdv_item_opcoes").delete().in("id", sair);
  }
  const apagar = [...idsAtuais].filter((id) => !mantidas.has(id));
  if (apagar.length) await supabase.from("pdv_item_grupos").delete().in("id", apagar);

  // Combo com pizza sai na impressora da pizzaria (a que recebe pizzas).
  if (temPizza) {
    const { data: imps } = await supabase.from("impressoras").select("id, comanda_produtos").eq("ativo", true).eq("recebe_pizzas", true);
    for (const im of (imps as { id: string; comanda_produtos: string[] | null }[]) ?? []) {
      if (im.comanda_produtos && !im.comanda_produtos.includes(itemId)) await supabase.from("impressoras").update({ comanda_produtos: [...im.comanda_produtos, itemId] }).eq("id", im.id);
    }
  }
  revalidatePath(`/salao/cardapio/combos/${itemId}`);
  revalidatePath("/pedir");
  return { ok: true as const };
}

// Busca de produto pra virar opção (no banco, nunca a tabela inteira na tela).
export async function buscarProdutosCombo(q: string) {
  await exigirAcesso("/salao");
  const t = q.trim();
  if (t.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("pdv_itens").select("id, nome, categoria, preco, promo_preco").eq("ativo", true).eq("combo", false).ilike("nome", `%${t.replace(/[%_]/g, "")}%`).order("nome").limit(20);
  return ((data as { id: string; nome: string; categoria: string | null; preco: number; promo_preco: number | null }[]) ?? [])
    .map((p) => ({ id: p.id, nome: p.nome, categoria: p.categoria, preco: Number(p.promo_preco ?? 0) > 0 ? Number(p.promo_preco) : Number(p.preco) }));
}

export async function excluirCombo(itemId: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  await supabase.from("pdv_itens").update({ ativo: false }).eq("id", itemId).eq("combo", true);
  revalidatePath("/salao/cardapio");
  redirect("/salao/cardapio");
}
