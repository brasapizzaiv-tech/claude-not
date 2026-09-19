"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";

const ehCor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Grava as cores da empresa. Só o dono mexe: muda a cara do sistema inteiro. */
export async function salvarCoresEmpresa(fd: FormData) {
  await exigirAcesso("/usuarios"); // só o dono tem esta rota

  const primaria = String(fd.get("cor_primaria") ?? "").toLowerCase();
  const escuro = String(fd.get("cor_escuro") ?? "").toLowerCase();
  const sobreEscuro = String(fd.get("cor_sobre_escuro") ?? "").toLowerCase();

  if (!ehCor(primaria) || !ehCor(escuro) || !ehCor(sobreEscuro)) {
    return { ok: false as const, mensagem: "Cor inválida. Use o seletor de cor." };
  }

  const supabase = await createClient();
  const { data: emp } = await supabase.from("empresas").select("id").limit(1).maybeSingle();
  if (!emp) return { ok: false as const, mensagem: "Empresa não encontrada." };

  await supabase
    .from("empresas")
    .update({ cor_primaria: primaria, cor_escuro: escuro, cor_sobre_escuro: sobreEscuro })
    .eq("id", emp.id);

  // A cor entra em TODA tela, então o sistema inteiro precisa ser redesenhado.
  revalidatePath("/", "layout");
  return { ok: true as const };
}
