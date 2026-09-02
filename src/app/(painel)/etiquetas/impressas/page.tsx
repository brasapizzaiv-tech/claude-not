import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hojeSP, somarDias } from "@/lib/etiqueta-vencimentos";
import { ImpressasClient, type EtImp } from "./impressas-client";

const PERIODOS = ["ontem", "hoje", "7d", "30d"] as const;
type Periodo = (typeof PERIODOS)[number];

export default async function ImpressasPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const p: Periodo = (PERIODOS as readonly string[]).includes(sp.p ?? "") ? (sp.p as Periodo) : "hoje";
  const hoje = hojeSP();
  const ini = p === "ontem" ? somarDias(hoje, -1) : p === "7d" ? somarDias(hoje, -6) : p === "30d" ? somarDias(hoje, -29) : hoje;
  const fim = p === "ontem" ? somarDias(hoje, -1) : hoje;
  const deIso = new Date(`${ini}T00:00:00-03:00`).toISOString();
  const ateIso = new Date(`${somarDias(fim, 1)}T00:00:00-03:00`).toISOString();

  const supabase = await createClient();
  const { data } = await supabase
    .from("etiquetas")
    .select("id, numero, produto_nome, categoria_nome, colaborador_nome, criado_em, validade, status, tipo, quantidade, unidade")
    .gte("criado_em", deIso)
    .lt("criado_em", ateIso)
    .order("criado_em", { ascending: false })
    .limit(3000);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <Link href="/etiquetas" className="text-sm text-zinc-500 hover:text-orange-600">← Etiquetas</Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">📈 Etiquetas impressas</h1>
      <p className="mt-1 mb-5 text-zinc-500">Quantas etiquetas saíram, em que horário e por quem.</p>
      <ImpressasClient rows={(data as EtImp[]) ?? []} periodo={p} ini={ini} fim={fim} />
    </div>
  );
}
