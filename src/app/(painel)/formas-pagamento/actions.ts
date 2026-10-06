"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TIPOS_FORMA, type TipoFormaCadastro } from "@/lib/formas-pagamento";

// Só o dono mexe aqui: a forma muda o caixa, o PDV, o delivery e o app.
async function exigirDono() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Faça login de novo.");
  const { data: perfil } = await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle();
  if (perfil?.papel !== "dono") throw new Error("Só o dono altera as formas de pagamento.");
  return supabase;
}

// As telas que leem o cadastro (o Next guarda a página renderizada).
function avisarTelas() {
  for (const p of ["/formas-pagamento", "/salao/caixa", "/salao/caixa/fiado", "/pdv", "/delivery/novo", "/pedir"]) revalidatePath(p);
}

export type DadosForma = {
  id?: string;
  nome: string;
  tipo: TipoFormaCadastro;
  nome_app: string | null;
  no_caixa: boolean;
  no_pdv: boolean;
  no_delivery: boolean;
  no_app: boolean;
  no_fiado: boolean;
};

export async function salvarForma(d: DadosForma): Promise<{ ok: boolean; erro?: string }> {
  try {
    const supabase = await exigirDono();
    const nome = d.nome.trim();
    if (!nome) return { ok: false, erro: "Dê um nome à forma." };
    if (!TIPOS_FORMA.some((t) => t.id === d.tipo)) return { ok: false, erro: "Tipo inválido." };
    const linha = {
      nome,
      tipo: d.tipo,
      nome_app: d.nome_app?.trim() || null,
      no_caixa: !!d.no_caixa,
      no_pdv: !!d.no_pdv,
      no_delivery: !!d.no_delivery,
      no_app: !!d.no_app,
      no_fiado: !!d.no_fiado,
    };
    if (d.id) {
      const { error } = await supabase.from("formas_pagamento").update(linha).eq("id", d.id);
      if (error) return { ok: false, erro: traduz(error.message) };
    } else {
      const { data: ult } = await supabase.from("formas_pagamento").select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
      const ordem = Number((ult as { ordem?: number } | null)?.ordem ?? 0) + 1;
      const { error } = await supabase.from("formas_pagamento").insert({ ...linha, ordem });
      if (error) return { ok: false, erro: traduz(error.message) };
    }
    avisarTelas();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não salvou." };
  }
}

export async function alternarForma(
  id: string,
  campo: "no_caixa" | "no_pdv" | "no_delivery" | "no_app" | "no_fiado" | "ativo",
  valor: boolean,
): Promise<{ ok: boolean; erro?: string }> {
  try {
    const supabase = await exigirDono();
    const { error } = await supabase.from("formas_pagamento").update({ [campo]: valor }).eq("id", id);
    if (error) return { ok: false, erro: error.message };
    avisarTelas();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não salvou." };
  }
}

// Sobe ou desce uma posição: troca a ordem com a vizinha.
export async function moverForma(id: string, direcao: -1 | 1): Promise<{ ok: boolean; erro?: string }> {
  try {
    const supabase = await exigirDono();
    const { data } = await supabase.from("formas_pagamento").select("id, ordem").order("ordem").order("criado_em");
    const lista = (data as { id: string; ordem: number }[] | null) ?? [];
    const i = lista.findIndex((f) => f.id === id);
    const j = i + direcao;
    if (i < 0 || j < 0 || j >= lista.length) return { ok: true };
    // Reescreve 1..n pra garantir que não há empates antes de trocar.
    const nova = lista.map((f, k) => ({ id: f.id, ordem: k + 1 }));
    [nova[i].ordem, nova[j].ordem] = [nova[j].ordem, nova[i].ordem];
    for (const f of nova) {
      const { error } = await supabase.from("formas_pagamento").update({ ordem: f.ordem }).eq("id", f.id);
      if (error) return { ok: false, erro: error.message };
    }
    avisarTelas();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não moveu." };
  }
}

// Apagar não mexe em venda antiga: o pagamento guarda o nome da forma.
export async function excluirForma(id: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const supabase = await exigirDono();
    const { error } = await supabase.from("formas_pagamento").delete().eq("id", id);
    if (error) return { ok: false, erro: error.message };
    avisarTelas();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não apagou." };
  }
}

function traduz(msg: string) {
  if (/formas_pagamento_empresa_nome|duplicate key/i.test(msg)) return "Já existe uma forma com esse nome.";
  return msg;
}
