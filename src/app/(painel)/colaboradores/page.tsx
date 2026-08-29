import { createClient } from "@/lib/supabase/server";
import type { Colaborador } from "@/lib/types";
import { ColaboradoresClient, type FolgaPerfil, type Row } from "./client";

export default async function ColaboradoresPage() {
  const supabase = await createClient();
  const [{ data: colabs }, { data: folgas }] = await Promise.all([
    supabase.from("colaboradores").select("*").eq("ativo", true).order("nome"),
    supabase
      .from("folgas_funcionarios")
      .select("id, colaborador_id, grupo, vinculo, funcao, dias, grupo2, dias2, gerente, ativo")
      .eq("ativo", true),
  ]);

  const folgaPorColab = new Map<string, FolgaPerfil>();
  for (const f of (folgas as (FolgaPerfil & { colaborador_id: string | null })[]) ?? []) {
    if (f.colaborador_id) folgaPorColab.set(f.colaborador_id, f);
  }

  const rows: Row[] = ((colabs as Colaborador[]) ?? []).map((c) => ({
    ...c,
    folga: folgaPorColab.get(c.id) ?? null,
  }));

  return <ColaboradoresClient rows={rows} />;
}
