"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodificar } from "@/lib/geo";
import { criarPedidoDeliveryCore, imprimirComandaDoPedido, calcularTaxaEntrega, type DadosPedidoDelivery } from "@/lib/delivery-core";

export type { LinhaPedido, DadosPedidoDelivery } from "@/lib/delivery-core";

// Cria o pedido pelo painel (atendente): já nasce "aceito" e imprime na cozinha.
export async function criarPedidoDelivery(d: DadosPedidoDelivery) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  const r = await criarPedidoDeliveryCore(supabase, d, { status: "aceito", atendenteId: uid, criadoPor: uid });
  if (r.ok) revalidatePath("/delivery");
  return r;
}

const CARIMBO: Record<string, string> = {
  aceito: "aceito_em", em_preparo: "preparo_em", pronto: "pronto_em",
  saiu: "saiu_em", entregue: "entregue_em", cancelado: "cancelado_em",
};

export async function definirStatusDelivery(id: string, status: string) {
  const supabase = await createClient();
  if (!(status in CARIMBO) && status !== "pendente") return { ok: false as const };
  const { data: ped } = await supabase.from("delivery_pedidos").select("entregador_id, comanda_id, status").eq("id", id).single();
  if (status === "saiu" && !ped?.entregador_id) return { ok: false as const, mensagem: "Escolha o entregador antes de despachar." };

  const patch: Record<string, unknown> = { status };
  if (status in CARIMBO) patch[CARIMBO[status]] = new Date().toISOString();
  await supabase.from("delivery_pedidos").update(patch).eq("id", id);

  // Pedido do app: ao ACEITAR (saindo de pendente), imprime na cozinha.
  if (status === "aceito" && ped?.status === "pendente") {
    await imprimirComandaDoPedido(supabase, id);
  }

  // Fecha/reabre a comanda junto do ciclo.
  if (ped?.comanda_id) {
    if (status === "entregue" || status === "cancelado") {
      await supabase.from("pdv_comandas").update({ status: "fechada", fechada_em: new Date().toISOString() }).eq("id", ped.comanda_id);
    } else {
      await supabase.from("pdv_comandas").update({ status: "aberta", fechada_em: null }).eq("id", ped.comanda_id);
    }
  }
  revalidatePath("/delivery");
  revalidatePath(`/delivery/${id}`);
  return { ok: true as const };
}

export async function definirEntregador(id: string, entregadorId: string | null) {
  const supabase = await createClient();
  await supabase.from("delivery_pedidos").update({ entregador_id: entregadorId }).eq("id", id);
  revalidatePath("/delivery");
  revalidatePath(`/delivery/${id}`);
  return { ok: true as const };
}

export async function definirPagoDelivery(id: string, pago: boolean) {
  const supabase = await createClient();
  await supabase.from("delivery_pedidos").update({ pago }).eq("id", id);
  revalidatePath("/delivery");
  revalidatePath(`/delivery/${id}`);
  return { ok: true as const };
}

export async function definirPrevisao(id: string, previsaoISO: string | null) {
  const supabase = await createClient();
  await supabase.from("delivery_pedidos").update({ previsao_em: previsaoISO }).eq("id", id);
  revalidatePath(`/delivery/${id}`);
  return { ok: true as const };
}

export async function reimprimirDelivery(id: string) {
  const supabase = await createClient();
  const enviado = await imprimirComandaDoPedido(supabase, id);
  return { ok: enviado > 0, enviado } as { ok: boolean; enviado: number };
}

// ---------- Entregadores ----------
export async function criarEntregador(formData: FormData) {
  const supabase = await createClient();
  const nome = ((formData.get("nome") as string) || "").trim();
  const telefone = ((formData.get("telefone") as string) || "").trim();
  if (!nome) return;
  await supabase.from("entregadores").insert({ nome, telefone: telefone || null });
  revalidatePath("/delivery/entregadores");
}

export async function alternarEntregador(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const ativo = formData.get("ativo") === "1";
  await supabase.from("entregadores").update({ ativo: !ativo }).eq("id", id);
  revalidatePath("/delivery/entregadores");
}

// Calcula a taxa de entrega pela distância (endereço → restaurante).
export async function calcularEntrega(endereco: {
  logradouro?: string; numero?: string; bairro?: string; cidade?: string; cep?: string;
}) {
  const supabase = await createClient();
  return calcularTaxaEntrega(supabase, endereco);
}

// Salva a config do delivery e geocodifica o endereço do restaurante.
export async function salvarConfigDelivery(formData: FormData) {
  const supabase = await createClient();
  const num = (k: string) => { const v = Number(String(formData.get(k) ?? "").replace(",", ".")); return Number.isFinite(v) ? v : 0; };
  const origemEndereco = String(formData.get("origem_endereco") ?? "").trim();

  const patch: Record<string, unknown> = {
    id: 1,
    origem_endereco: origemEndereco || null,
    taxa_base: num("taxa_base"),
    preco_km: num("preco_km"),
    raio_max_km: num("raio_max_km"),
    tempo_preparo_min: Math.round(num("tempo_preparo_min")) || 40,
    aberto: formData.get("aberto") === "on",
    aviso: String(formData.get("aviso") ?? "").trim() || null,
    atualizado_em: new Date().toISOString(),
  };
  if (origemEndereco) {
    const c = await geocodificar(origemEndereco);
    if (c) { patch.origem_lat = c.lat; patch.origem_lng = c.lng; }
  }
  await supabase.from("delivery_config").upsert(patch, { onConflict: "id" });
  revalidatePath("/delivery/config");
}

// ---------- Cardápio do app (/delivery/cardapio) ----------

// Sobe a foto de um item ou sabor pro bucket público e grava a URL.
export async function salvarFotoCardapio(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false as const, mensagem: "Sem acesso." };

  const tipo = formData.get("tipo") as string; // 'item' | 'sabor'
  const id = formData.get("id") as string;
  const file = formData.get("foto") as File | null;
  if (!["item", "sabor"].includes(tipo) || !id || !file || file.size === 0) return { ok: false as const, mensagem: "Escolha uma foto." };
  if (file.size > 4 * 1024 * 1024) return { ok: false as const, mensagem: "Foto muito grande (máx. 4MB)." };
  if (!file.type.startsWith("image/")) return { ok: false as const, mensagem: "O arquivo precisa ser uma imagem." };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${tipo}/${id}.${ext}`;
  const admin = createAdminClient();
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from("cardapio").upload(path, bytes, { contentType: file.type, upsert: true });
  if (error) return { ok: false as const, mensagem: `Falha no upload: ${error.message}` };

  const { data: pub } = admin.storage.from("cardapio").getPublicUrl(path);
  const url = `${pub.publicUrl}?v=${new Date().getTime()}`; // cache-bust ao trocar a foto
  const tabela = tipo === "item" ? "pdv_itens" : "pdv_pizza_sabores";
  await supabase.from(tabela).update({ foto_url: url }).eq("id", id);
  revalidatePath("/delivery/cardapio");
  return { ok: true as const, url };
}

export async function removerFotoCardapio(formData: FormData) {
  const supabase = await createClient();
  const tipo = formData.get("tipo") as string;
  const id = formData.get("id") as string;
  if (!["item", "sabor"].includes(tipo) || !id) return;
  const tabela = tipo === "item" ? "pdv_itens" : "pdv_pizza_sabores";
  await supabase.from(tabela).update({ foto_url: null }).eq("id", id);
  revalidatePath("/delivery/cardapio");
}

// Salva descrição (item/sabor) e a visibilidade do item no app.
export async function salvarDetalheCardapio(formData: FormData) {
  const supabase = await createClient();
  const tipo = formData.get("tipo") as string;
  const id = formData.get("id") as string;
  if (!["item", "sabor"].includes(tipo) || !id) return;
  const descricao = String(formData.get("descricao") ?? "").trim().slice(0, 300) || null;
  if (tipo === "item") {
    const delivery = formData.get("delivery") === "on";
    await supabase.from("pdv_itens").update({ descricao, delivery }).eq("id", id);
  } else {
    await supabase.from("pdv_pizza_sabores").update({ descricao }).eq("id", id);
  }
  revalidatePath("/delivery/cardapio");
}

export async function salvarFatias(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const fatias = Math.round(Number(formData.get("fatias"))) || null;
  if (!id) return;
  await supabase.from("pdv_pizza_tamanhos").update({ fatias }).eq("id", id);
  revalidatePath("/delivery/cardapio");
}

// Busca cliente por telefone (autocompleta o Novo pedido).
export async function buscarClientePorTelefone(termo: string) {
  const supabase = await createClient();
  const t = (termo || "").replace(/\D/g, "");
  if (t.length < 4) return [];
  const { data } = await supabase
    .from("clientes")
    .select("id, nome, telefone, logradouro, numero, complemento, bairro, municipio, cep")
    .ilike("telefone", `%${t}%`)
    .limit(6);
  return (data ?? []) as {
    id: string; nome: string; telefone: string | null;
    logradouro: string | null; numero: string | null; complemento: string | null;
    bairro: string | null; municipio: string | null; cep: string | null;
  }[];
}
