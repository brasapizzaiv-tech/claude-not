"use server";

import { createClient } from "@/lib/supabase/server";
import { ehTema, type Tema } from "@/lib/tema";

// Guarda a aparência escolhida no perfil de quem está logado, pra ela valer
// também nos outros aparelhos da pessoa. O cookie que faz a tela nascer na cor
// certa é gravado no navegador pelo próprio seletor; aqui é só a memória longa.
export async function salvarTema(tema: Tema) {
  if (!ehTema(tema)) return { ok: false as const };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const };

  await supabase.from("profiles").update({ tema }).eq("id", user.id);
  return { ok: true as const };
}
