"use server";

// Vitrine do app (migration 0236) — o que o painel decide sobre o /pedir:
// destaques do topo, sugestões e gatilhos de cupom. Permissão do delivery.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";

const ok = () => { revalidatePath("/delivery/vitrine"); revalidatePath("/pedir"); return { ok: true as const }; };
const erro = (mensagem: string) => ({ ok: false as const, mensagem });
const dataHora = (v: unknown) => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? new Date(`${s}:00-03:00`).toISOString() : null;
};

export type DestaqueForm = {
  id?: string | null;
  /** id do produto, ou "pz:<tamanho>" quando o destaque é pizza (migration 0246). */
  titulo: string; subtitulo: string; itemId: string; pizzaSaborId?: string; selo: string; fotoUrl: string;
  precoDe: string; precoPor: string; inicio: string; fim: string; ativo: boolean;
};

export async function salvarDestaque(d: DestaqueForm) {
  await exigirAcesso("/delivery");
  const titulo = (d.titulo || "").trim();
  if (titulo.length < 2) return erro("Dê um título pro destaque.");
  const pz = (d.itemId || "").startsWith("pz:") ? d.itemId.slice(3) : "";
  const pizzaTamanhoId = /^[0-9a-f-]{36}$/i.test(pz) ? pz : null;
  const linha = {
    titulo: titulo.slice(0, 80),
    subtitulo: (d.subtitulo || "").trim().slice(0, 140) || null,
    item_id: /^[0-9a-f-]{36}$/i.test(d.itemId || "") ? d.itemId : null,
    pizza_tamanho_id: pizzaTamanhoId,
    pizza_sabor_id: pizzaTamanhoId && /^[0-9a-f-]{36}$/i.test(d.pizzaSaborId || "") ? d.pizzaSaborId : null,
    selo: (d.selo || "").trim().slice(0, 20) || null,
    foto_url: /^https?:\/\//.test((d.fotoUrl || "").trim()) ? d.fotoUrl.trim() : null,
    // Preço do banner = preço do produto (o que o carrinho cobra); não se digita.
    preco_de: null,
    preco_por: null,
    inicio: dataHora(d.inicio),
    fim: dataHora(d.fim),
    ativo: !!d.ativo,
  };
  if (!linha.item_id && !linha.pizza_tamanho_id) return erro("Escolha o produto que o botão \"Pedir agora\" coloca no carrinho.");
  if (linha.inicio && linha.fim && linha.fim <= linha.inicio) return erro("O fim tem que ser depois do início.");
  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("vitrine_destaques").update(linha).eq("id", d.id)
    : await supabase.from("vitrine_destaques").insert(linha);
  return error ? erro(error.message) : ok();
}

export async function removerDestaque(id: string) {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const { error } = await supabase.from("vitrine_destaques").delete().eq("id", id);
  return error ? erro(error.message) : ok();
}

export async function adicionarSugestao(momento: "produto" | "carrinho", categoria: string | null, itemId: string) {
  await exigirAcesso("/delivery");
  if (!/^[0-9a-f-]{36}$/i.test(itemId || "")) return erro("Escolha o produto.");
  if (momento === "produto" && !(categoria || "").trim()) return erro("Escolha quando sugerir.");
  const supabase = await createClient();
  const { error } = await supabase.from("vitrine_sugestoes").insert({ momento, categoria: momento === "produto" ? categoria : null, item_id: itemId });
  return error ? erro(error.message) : ok();
}

export async function removerSugestao(id: string) {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const { error } = await supabase.from("vitrine_sugestoes").delete().eq("id", id);
  return error ? erro(error.message) : ok();
}

export async function salvarGatilho(chave: "boas_vindas" | "parado" | "abandonado", d: { ativo: boolean; cupom: string | null; minutos: number | null; validadeMin: number | null }) {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const cupom = (d.cupom || "").trim().toUpperCase() || null;
  // Regra da vitrine: cupom só sai se estiver cadastrado.
  if (d.ativo && !cupom) return erro("Escolha o cupom antes de ligar.");
  if (cupom) {
    const { data: c } = await supabase.from("cupons").select("ativo").ilike("codigo", cupom).maybeSingle();
    if (!c) return erro(`O cupom ${cupom} não está cadastrado em Cupons.`);
    if (d.ativo && !(c as { ativo: boolean }).ativo) return erro(`O cupom ${cupom} está desativado em Cupons.`);
  }
  const lim = (n: number | null, min: number, max: number) => (n == null ? null : Math.min(max, Math.max(min, Math.round(n))));
  const { error } = await supabase.from("vitrine_gatilhos").upsert({
    chave,
    ativo: !!d.ativo,
    cupom,
    minutos: chave === "boas_vindas" ? null : lim(d.minutos, chave === "abandonado" ? 5 : 1, 240),
    validade_min: chave === "parado" ? lim(d.validadeMin, 1, 240) : null,
  }, { onConflict: "empresa_id,chave" });
  return error ? erro(error.message) : ok();
}
