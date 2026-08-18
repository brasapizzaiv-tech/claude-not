"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

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
) {
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  const supabase = await createClient();
  const { data } = await supabase.rpc("colaborador_conferir_pedido", {
    p_token: token,
    p_pin: pin,
    p_pedido_id: pedidoId,
    p_itens: itens,
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
