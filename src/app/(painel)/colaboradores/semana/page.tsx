import { createClient } from "@/lib/supabase/server";
import { diasDaSemana, segundaDe, somarDias, ymd } from "@/lib/equipe";
import { SemanaClient, type Pessoa } from "./semana";

export const dynamic = "force-dynamic";

export default async function SemanaPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const segunda = segundaDe(/^\d{4}-\d{2}-\d{2}$/.test(s ?? "") ? (s as string) : ymd(new Date()));
  const dias = diasDaSemana(segunda);
  const fim = somarDias(segunda, 6);

  const supabase = await createClient();
  const [{ data: colabs }, { data: pres }, { data: dez }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id, nome, turno, vinculo, funcao, valor_dia, valor_noite, salario_base, recebe_10, peso_10, esporadico, ativo")
      .eq("ativo", true)
      .order("nome"),
    supabase.from("presencas").select("colaborador_id, data, turno").gte("data", segunda).lte("data", fim),
    supabase.from("dez_por_cento_noites").select("data, valor, obs").gte("data", segunda).lte("data", fim),
  ]);

  return (
    <SemanaClient
      segunda={segunda}
      dias={dias}
      pessoas={(colabs ?? []) as Pessoa[]}
      presencasIniciais={(pres ?? []) as { colaborador_id: string; data: string; turno: "dia" | "noite" }[]}
      dezIniciais={(dez ?? []) as { data: string; valor: number; obs: string | null }[]}
    />
  );
}
