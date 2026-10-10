"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { segundaDe } from "@/lib/equipe";
import { mesesDoTrimestre, periodoMes } from "@/lib/assiduidade-core";
import { apurarAssiduidade, hojeSP, lerConfig } from "@/lib/assiduidade-server";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function salvarConfigAssiduidade(fd: FormData) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const entradas: Record<string, string> = {};
  for (let d = 0; d <= 6; d++) {
    const v = String(fd.get(`entrada_${d}`) ?? "").trim();
    if (HORA.test(v)) entradas[String(d)] = v;
  }
  const num = (k: string, padrao: number) => { const n = Number(String(fd.get(k) ?? "").replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : padrao; };
  const inicio = String(fd.get("inicio") ?? "");
  const row = {
    ativo: fd.get("ativo") === "on",
    valor_mes: num("valor_mes", 100),
    tolerancia_min: Math.round(num("tolerancia_min", 15)),
    dia_inicio_mes: Math.min(28, Math.max(1, Math.round(num("dia_inicio_mes", 1)))),
    inicio: DATA.test(inicio) ? inicio : null,
    entradas,
    atualizado_em: new Date().toISOString(),
  };
  const { data: atual } = await supabase.from("assiduidade_config").select("empresa_id").maybeSingle();
  if (atual) await supabase.from("assiduidade_config").update(row).eq("empresa_id", (atual as { empresa_id: string }).empresa_id);
  else await supabase.from("assiduidade_config").insert(row);
  revalidatePath("/colaboradores/assiduidade");
}

export async function salvarAtestado(fd: FormData) {
  await exigirAcesso("/colaboradores");
  const colaborador = String(fd.get("colaborador_id") ?? "");
  const inicio = String(fd.get("inicio") ?? "");
  const fim = String(fd.get("fim") ?? "") || inicio;
  if (!colaborador || !DATA.test(inicio) || !DATA.test(fim) || fim < inicio) return { ok: false as const, erro: "Escolha a pessoa e as datas do atestado." };
  const supabase = await createClient();
  const { error } = await supabase.from("atestados").insert({ colaborador_id: colaborador, inicio, fim, motivo: String(fd.get("motivo") ?? "").trim().slice(0, 200) || null });
  if (error) return { ok: false as const, erro: error.message };
  revalidatePath("/colaboradores/assiduidade");
  return { ok: true as const };
}

export async function apagarAtestado(id: string) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  await supabase.from("atestados").delete().eq("id", id);
  revalidatePath("/colaboradores/assiduidade");
}

// Fecha o trimestre: soma os meses ganhos de cada um e põe como extra no
// acerto da semana atual (Semana e 10%). Não paga duas vezes (uma linha por
// pessoa e trimestre em assiduidade_pagamentos).
export async function lancarPremioTrimestre(trimestre: string) {
  await exigirAcesso("/colaboradores");
  if (!/^\d{4}-T[1-4]$/.test(trimestre)) return { ok: false as const, erro: "Trimestre inválido." };
  const supabase = await createClient();
  const cfg = await lerConfig(supabase);
  const meses = mesesDoTrimestre(trimestre);
  const fimTri = periodoMes(meses[2], cfg.dia_inicio_mes).ate;
  const hoje = hojeSP();
  if (hoje <= fimTri) return { ok: false as const, erro: "O trimestre ainda não acabou." };

  const apurados = await Promise.all(meses.map((m) => apurarAssiduidade(supabase, m, cfg)));
  const ganhos = new Map<string, { nome: string; meses: number }>();
  for (const a of apurados) for (const p of a.pessoas) {
    const g = ganhos.get(p.id) ?? { nome: p.nome, meses: 0 };
    if (p.resultado.ganhou === true) g.meses++;
    ganhos.set(p.id, g);
  }
  const { data: pagos } = await supabase.from("assiduidade_pagamentos").select("colaborador_id").eq("trimestre", trimestre);
  const jaPago = new Set(((pagos ?? []) as { colaborador_id: string }[]).map((p) => p.colaborador_id));
  const segunda = segundaDe(hoje);
  const rot = `Prêmio assiduidade ${trimestre.replace("-T", " T")}`;
  let n = 0;
  let total = 0;
  for (const [id, g] of ganhos) {
    if (g.meses === 0 || jaPago.has(id)) continue;
    const valor = g.meses * cfg.valor_mes;
    const { error } = await supabase.from("assiduidade_pagamentos").insert({ colaborador_id: id, trimestre, meses: g.meses, valor, segunda });
    if (error) continue; // já pago por outra aba
    // Soma no extra da semana (um extra por pessoa e semana: junta com o que já houver).
    const { data: ex } = await supabase.from("semana_extras").select("valor, motivo, turno, desconto, desconto_motivo").eq("segunda", segunda).eq("colaborador_id", id).maybeSingle();
    const e = ex as { valor: number; motivo: string | null; turno: string | null; desconto: number | null; desconto_motivo: string | null } | null;
    await supabase.from("semana_extras").upsert({
      segunda, colaborador_id: id,
      valor: Math.round(((Number(e?.valor) || 0) + valor) * 100) / 100,
      motivo: [e?.motivo, `${rot} (${g.meses} ${g.meses === 1 ? "mês" : "meses"})`].filter(Boolean).join(" + "),
      turno: e?.turno ?? "dia", desconto: e?.desconto ?? 0, desconto_motivo: e?.desconto_motivo ?? null,
    }, { onConflict: "segunda,colaborador_id" });
    n++;
    total += valor;
  }
  revalidatePath("/colaboradores/assiduidade");
  revalidatePath("/colaboradores/semana");
  return { ok: true as const, n, total, segunda };
}
