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
  const [{ data: colabs }, { data: dez }, { data: pagos }, { data: fiado }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id, nome, turno, vinculo, vinculo_noite, funcao, valor_dia, valor_noite, salario_base, recebe_10, peso_10, esporadico, ativo")
      .eq("ativo", true)
      .order("nome"),
    // 10%: noites pagas NESTA semana (normalmente da semana passada) + noites desta semana (pagas na próxima).
    supabase
      .from("dez_por_cento_noites")
      .select("data, valor, pagar_em")
      .or(`pagar_em.eq.${segunda},and(data.gte.${segunda},data.lte.${fim})`)
      .order("data"),
    supabase.from("semana_pagamentos").select("colaborador_id, valor, lancamento_id, desconto").eq("segunda", segunda),
    // Fiado em aberto (compras internas) — pra poder descontar no acerto.
    supabase.from("retiradas").select("colaborador_id, valor").eq("status", "aberto").limit(5000),
  ]);

  // Presenças da semana + das noites de 10% que entram neste acerto (podem ser de outra semana).
  const datasExtras = ((dez ?? []) as { data: string }[]).map((d) => d.data).filter((d) => d < segunda || d > fim);
  const [{ data: presSemana }, { data: presExtras }] = await Promise.all([
    supabase.from("presencas").select("colaborador_id, data, turno").gte("data", segunda).lte("data", fim),
    datasExtras.length
      ? supabase.from("presencas").select("colaborador_id, data, turno").in("data", datasExtras)
      : Promise.resolve({ data: [] as { colaborador_id: string; data: string; turno: string }[] }),
  ]);

  const fiadoPor: Record<string, { valor: number; n: number }> = {};
  for (const r of (fiado ?? []) as { colaborador_id: string | null; valor: number }[]) {
    if (!r.colaborador_id) continue;
    const f = (fiadoPor[r.colaborador_id] ??= { valor: 0, n: 0 });
    f.valor += Number(r.valor) || 0;
    f.n++;
  }

  return (
    <SemanaClient
      segunda={segunda}
      dias={dias}
      pessoas={(colabs ?? []) as Pessoa[]}
      presencasIniciais={[...(presSemana ?? []), ...(presExtras ?? [])] as { colaborador_id: string; data: string; turno: "dia" | "noite" }[]}
      dezIniciais={(dez ?? []) as { data: string; valor: number; pagar_em: string }[]}
      pagos={(pagos ?? []) as { colaborador_id: string; valor: number; lancamento_id: string | null; desconto: number }[]}
      fiadoPor={fiadoPor}
    />
  );
}
