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
