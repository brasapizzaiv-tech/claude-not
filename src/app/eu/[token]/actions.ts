"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalcularDivergencias } from "@/lib/conferencia-core";

const soDigitos = (s: string) => (s || "").replace(/\D/g, "").slice(0, 4);

async function gravarCookie(token: string, pin: string) {
  const jar = await cookies();
  jar.set(`eu_${token}`, pin, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: `/eu/${token}`,
    maxAge: 60 * 60 * 24 * 180, // 180 dias
  });
}

export async function definirPin(token: string, pinRaw: string) {
  const pin = soDigitos(pinRaw);
  if (pin.length !== 4) return { ok: false, erro: "O PIN precisa ter 4 números." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("colaborador_definir_pin", {
    p_token: token,
    p_pin: pin,
  });
  if (!data?.ok) return { ok: false, erro: "Não foi possível definir o PIN." };
  await gravarCookie(token, pin);
  return { ok: true };
}

// Conferência leve de um pedido pelo colaborador (só confirma itens/quantidade).
export async function conferirPedidoColab(
  token: string,
  pedidoId: string,
  itens: { id: string; qtd: string }[],
  marcar = true,
) {
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  const supabase = await createClient();
  const { data } = await supabase.rpc("colaborador_conferir_pedido", {
    p_token: token,
    p_pin: pin,
    p_pedido_id: pedidoId,
    p_itens: itens,
    p_marcar: marcar,
  });
  // Divergências (recebido ≠ pedido, nota etc.) ficam gravadas no pedido pra
  // lista e relatório do painel. Só com a permissão já conferida pela RPC.
  if (data?.ok) { try { await recalcularDivergencias(createAdminClient(), pedidoId); } catch { /* sem bloquear a conferência */ } }
  return { ok: !!data?.ok };
}

// Resposta à pergunta obrigatória do dia da entrega sem conferir:
// "adiar" (ainda não chegou, pergunta de novo em 2 h) ou "nao_veio" (vai pro
// mural do escritório). Migration 0228.
export async function responderEntregaColab(token: string, pedidoId: string, resposta: "adiar" | "nao_veio", obs?: string) {
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  const supabase = await createClient();
  const { data } = await supabase.rpc("colaborador_responder_entrega", {
    p_token: token,
    p_pin: pin,
    p_pedido_id: pedidoId,
    p_resposta: resposta,
    p_obs: obs ?? null,
  });
  return { ok: !!data?.ok };
}

// Adiciona um item que veio a mais na conferência do colaborador.
export async function adicionarItemColab(
  token: string,
  pedidoId: string,
  produtoId: string,
  qtd: number,
) {
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  const supabase = await createClient();
  const { data } = await supabase.rpc("colaborador_add_item", {
    p_token: token,
    p_pin: pin,
    p_pedido_id: pedidoId,
    p_produto_id: produtoId,
    p_qtd: qtd,
  });
  return { ok: !!data?.ok };
}

// Remove um item da conferência do colaborador.
export async function removerItemColab(token: string, itemId: string) {
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  const supabase = await createClient();
  const { data } = await supabase.rpc("colaborador_remove_item", {
    p_token: token,
    p_pin: pin,
    p_item_id: itemId,
  });
  return { ok: !!data?.ok };
}

export async function entrarPin(token: string, pinRaw: string) {
  const pin = soDigitos(pinRaw);
  if (pin.length !== 4) return { ok: false, erro: "Digite os 4 números." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("colaborador_home", {
    p_token: token,
    p_pin: pin,
  });
  if (!data || data.erro) return { ok: false, erro: "PIN incorreto." };
  await gravarCookie(token, pin);
  return { ok: true };
}

// "Sair deste aparelho": esquece o PIN guardado neste celular (o cookie). O
// app nativo ainda volta pra tela do código (src/components/sair-do-aparelho.tsx).
export async function sairDoAparelhoColab(token: string) {
  const jar = await cookies();
  jar.delete({ name: `eu_${token}`, path: `/eu/${token}` });
  return { ok: true };
}

// Celular registrado pra receber avisos (app Motelli Equipe, migration 0234).
export async function registrarPushColab(token: string, push: string, plataforma: "android" | "ios") {
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  const supabase = await createClient();
  const { data } = await supabase.rpc("colaborador_registrar_push", { p_token: token, p_pin: pin, p_push: push, p_plataforma: plataforma });
  return { ok: !!(data as { ok?: boolean } | null)?.ok };
}

// "Sair deste aparelho": este celular para de receber os avisos da pessoa.
export async function removerPushColab(token: string, push: string) {
  const supabase = await createClient();
  await supabase.rpc("colaborador_remover_push", { p_token: token, p_push: push });
  return { ok: true };
}
