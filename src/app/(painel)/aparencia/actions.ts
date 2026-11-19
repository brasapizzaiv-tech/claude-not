"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaAtualId } from "@/lib/empresa";
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

  // A tabela empresas não tem regra de escrita pra sessão (só leitura, 0185):
  // gravar pela sessão "dava certo" sem mudar nada. Grava pela chave
  // administrativa, SÓ na empresa de quem está logado (o dono, conferido acima).
  const empresaId = await empresaAtualId();
  if (!empresaId) return { ok: false as const, mensagem: "Empresa não encontrada." };

  const { data: gravou, error } = await createAdminClient()
    .from("empresas")
    .update({ cor_primaria: primaria, cor_escuro: escuro, cor_sobre_escuro: sobreEscuro })
    .eq("id", empresaId)
    .select("id");
  if (error || !gravou?.length) {
    return { ok: false as const, mensagem: "Não deu pra salvar as cores. Confira a internet e tente de novo." };
  }

  // A cor entra em TODA tela, então o sistema inteiro precisa ser redesenhado.
  revalidatePath("/", "layout");
  return { ok: true as const };
}
