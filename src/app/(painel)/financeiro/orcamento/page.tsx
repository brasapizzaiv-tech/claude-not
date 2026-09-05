import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { DreCategoria } from "@/lib/types";
import { hojeSP } from "@/lib/etiqueta-vencimentos";
import { OrcamentoClient, type LinhaOrc } from "./orcamento-client";

function desloca(mes: string, delta: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function rotuloMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const sp = await searchParams;
  const mes =
    sp.mes && /^\d{4}-\d{2}$/.test(sp.mes)
      ? sp.mes
      : hojeSP().slice(0, 7);
  const ini = `${mes}-01`;
  const fim = `${desloca(mes, 1)}-01`;

  const supabase = await createClient();
  const [{ data: cats }, { data: orcs }, { data: lancs }] = await Promise.all([
    supabase.from("dre_categorias").select("*").eq("ativo", true).order("ordem"),
    supabase.from("orcamentos").select("categoria_id, valor").eq("ano_mes", mes),
    supabase
      .from("lancamentos")
      .select("categoria_id, valor")
      .gte("data", ini)
      .lt("data", fim),
  ]);

  const categorias = (cats as DreCategoria[]) ?? [];
  const orcado = new Map<string, number>();
  for (const o of orcs ?? []) orcado.set(o.categoria_id, Number(o.valor));
  const realizado = new Map<string, number>();
  for (const l of lancs ?? [])
    if (l.categoria_id)
      realizado.set(
        l.categoria_id,
        (realizado.get(l.categoria_id) ?? 0) + Number(l.valor),
      );

  const linhas: LinhaOrc[] = categorias.map((c) => ({
    id: c.id,
    grupo: c.grupo,
    nome: c.nome,
    tipo: c.tipo,
    orcado: orcado.get(c.id) ?? 0,
    realizado: realizado.get(c.id) ?? 0,
  }));

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Orçamento × Real
          </h1>
          <p className="mt-1 text-zinc-500">
            Defina a meta de cada categoria e compare com o realizado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/financeiro/orcamento?mes=${desloca(mes, -1)}`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">‹</Link>
          <span className="min-w-40 text-center text-sm font-medium capitalize text-zinc-700 dark:text-zinc-300">
            {rotuloMes(mes)}
          </span>
          <Link href={`/financeiro/orcamento?mes=${desloca(mes, 1)}`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">›</Link>
          <Link href={`/financeiro?mes=${mes}`} className="ml-2 rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950">
            Financeiro
          </Link>
        </div>
      </div>

      <OrcamentoClient mes={mes} linhas={linhas} />
    </div>
  );
}
