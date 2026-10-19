import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/todas";
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
  // Em páginas: 30 dias já passam de 1000 etiquetas (1,2 mil em out/2026) e o
  // banco corta cada consulta em 1000 — o .limit(3000) não valia.
  const data = await buscarTodas<EtImp>((de, ate) =>
    supabase
      .from("etiquetas")
      .select("id, numero, produto_nome, categoria_nome, colaborador_nome, criado_em, validade, status, tipo, quantidade, unidade")
      .gte("criado_em", deIso)
      .lt("criado_em", ateIso)
      .order("criado_em", { ascending: false })
      .order("id")
      .range(de, ate),
  );

  return (
    <div className="w-full p-8">
      <Link href="/etiquetas" className="text-sm font-semibold text-texto-marca hover:underline">← Etiquetas</Link>
      <h1 className="mt-2 font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto">📈 Etiquetas impressas</h1>
      <p className="mt-1 mb-5 text-texto-suave">Quantas etiquetas saíram, em que horário e por quem.</p>
      <ImpressasClient rows={data} periodo={p} ini={ini} fim={fim} />
    </div>
  );
}
