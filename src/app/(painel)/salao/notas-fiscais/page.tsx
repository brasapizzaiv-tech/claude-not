import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarPorLotes, buscarTodas } from "@/lib/supabase/todas";
import { NotasClient, type NotaLinha } from "./notas-client";

export default async function NotasFiscaisPage() {
  const supabase = await createClient();
  // A lista mostra as 1000 mais recentes (o banco não devolve mais que isso
  // por consulta). Os cartões contam TODAS: antes eram calculados em cima da
  // lista e travavam em 1000 notas (já são 1,5 mil desde set/2026).
  const base = () => supabase.from("nfce_emitidas").select("id", { count: "exact", head: true });
  const contar = (filtro: (q: ReturnType<typeof base>) => ReturnType<typeof base>) =>
    filtro(base()).then(({ count }) => count ?? 0);
  const [{ data }, emitidas, canceladas, erro, valores] = await Promise.all([
    supabase
      .from("nfce_emitidas")
      .select("id, modelo, ambiente, status, numero, serie, chave, url_danfe, url_xml, valor, mensagem, criado_em, comanda_ids, pdv_comandas(numero)")
      .order("criado_em", { ascending: false })
      .limit(1000),
    contar((q) => q.eq("status", "autorizado")),
    contar((q) => q.eq("status", "cancelado")),
    contar((q) => q.or("status.is.null,status.not.in.(autorizado,cancelado)")),
    buscarTodas<{ valor: number | null }>(
      (de, ate) => supabase.from("nfce_emitidas").select("valor").eq("status", "autorizado").order("id").range(de, ate),
      500000,
    ),
  ]);
  const valorTotal = valores.reduce((s, v) => s + Number(v.valor ?? 0), 0);

  // Nota de várias comandas: busca os números de todas (em lotes — a lista de
  // ids vai no endereço da consulta, que tem tamanho máximo).
  const todosIds = [...new Set(((data as unknown as { comanda_ids?: string[] | null }[]) ?? []).flatMap((r) => r.comanda_ids ?? []))];
  const numeroDe = new Map<string, number>();
  const cs = await buscarPorLotes<{ id: string; numero: number }>(todosIds, (lote) =>
    supabase.from("pdv_comandas").select("id, numero").in("id", lote),
  );
  for (const c of cs) numeroDe.set(c.id, c.numero);

  const linhas: NotaLinha[] = ((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
    id: r.id as string,
    modelo: (r.modelo as string) || "nfce",
    ambiente: (r.ambiente as string) || "",
    status: (r.status as string) || "",
    numero: (r.numero as string) || null,
    serie: (r.serie as string) || null,
    chave: (r.chave as string) || null,
    urlDanfe: (r.url_danfe as string) || null,
    urlXml: (r.url_xml as string) || null,
    valor: r.valor != null ? Number(r.valor) : null,
    mensagem: (r.mensagem as string) || null,
    criadoEm: (r.criado_em as string) || null,
    comandaNumero: (r.pdv_comandas as { numero?: number } | null)?.numero ?? null,
    comandas: ((r.comanda_ids as string[] | null) ?? []).map((id) => numeroDe.get(id)).filter((n): n is number => n != null),
  }));

  const total = emitidas + canceladas + erro;

  return (
    <div className="w-full p-6">
      <Link href="/salao" className="text-sm font-semibold text-texto-marca hover:underline">← Salão</Link>
      <h1 className="mt-2 font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto">Notas fiscais</h1>
      <p className="mt-1 text-sm text-texto-suave">
        Notas geradas pelo sistema (NFC-e/NF-e). Ambiente atual das últimas emissões destacado nos cartões.
      </p>
      {total > linhas.length && (
        <p className="mt-1 text-sm text-texto-suave">
          Os cartões contam todas as {total.toLocaleString("pt-BR")} notas; a lista e a busca mostram as {linhas.length.toLocaleString("pt-BR")} mais recentes.
        </p>
      )}

      <NotasClient
        linhas={linhas}
        stats={{ emitidas, valorTotal, canceladas, erro }}
      />
    </div>
  );
}
