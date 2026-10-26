import { createClient } from "@/lib/supabase/server";
import type { Colaborador } from "@/lib/types";
import { ColaboradoresClient, type FolgaPerfil, type HorarioOpcao, type Row } from "./client";
import { resumoHorario, type HorarioPonto } from "@/lib/ponto-horarios-core";
import { hojeSP } from "@/lib/assiduidade-server";

export default async function ColaboradoresPage() {
  const supabase = await createClient();
  const hoje = hojeSP();
  const [{ data: colabs }, { data: folgas }, { data: setoresCk }, { data: hors }, { data: vincs }, { data: motivos }] = await Promise.all([
    supabase.from("colaboradores").select("*").order("nome"),
    supabase
      .from("folgas_funcionarios")
      .select("id, colaborador_id, grupo, vinculo, funcao, dias, grupo2, dias2, gerente, ativo")
      .eq("ativo", true),
    supabase.from("checklist_setores").select("id, nome, cor").eq("ativo", true).order("ordem").order("nome"),
    // Horários de trabalho (migration 0255) e em qual cada um está hoje.
    supabase.from("ponto_horarios").select("id, nome, ativo, dias").order("nome"),
    supabase.from("colaborador_horarios").select("colaborador_id, horario_id, de, ate").lte("de", hoje),
    supabase.from("motivos_demissao").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  const horarios = (hors ?? []) as Pick<HorarioPonto, "id" | "nome" | "ativo" | "dias">[];
  const nomeHorario = new Map(horarios.map((h) => [h.id, h.nome]));
  const horarioHoje = new Map<string, string>();
  for (const v of ((vincs ?? []) as { colaborador_id: string; horario_id: string; de: string; ate: string | null }[]).sort((a, b) => String(a.de).localeCompare(String(b.de)))) {
    if (!v.ate || String(v.ate).slice(0, 10) >= hoje) horarioHoje.set(v.colaborador_id, v.horario_id);
  }
  const opcoes: HorarioOpcao[] = horarios.filter((h) => h.ativo).map((h) => ({ id: h.id, nome: h.nome, resumo: resumoHorario(h) }));

  const folgaPorColab = new Map<string, FolgaPerfil>();
  for (const f of (folgas as (FolgaPerfil & { colaborador_id: string | null })[]) ?? []) {
    if (f.colaborador_id) folgaPorColab.set(f.colaborador_id, f);
  }

  const rows: Row[] = ((colabs as Colaborador[]) ?? []).map((c) => ({
    ...c,
    folga: folgaPorColab.get(c.id) ?? null,
    horario: horarioHoje.has(c.id) ? { id: horarioHoje.get(c.id) as string, nome: nomeHorario.get(horarioHoje.get(c.id) as string) ?? "" } : null,
  }));

  return <ColaboradoresClient rows={rows} setoresChecklist={(setoresCk as { id: string; nome: string; cor: string | null }[]) ?? []} horarios={opcoes} motivos={(motivos ?? []) as { id: string; nome: string }[]} />;
}
