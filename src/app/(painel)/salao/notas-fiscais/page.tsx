import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NotasClient } from "./notas-client";
import { consultarNotas, POR_PAGINA } from "./consulta";

export const metadata = { title: "Notas fiscais" };

export default async function NotasFiscaisPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; modelo?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const filtro = { q: sp.q ?? "", status: sp.status ?? "", modelo: sp.modelo ?? "" };
  const pagina = Math.max(0, Math.floor(Number(sp.pagina) || 0));
  const supabase = await createClient();

  // Os cartões contam TODAS as notas; a lista vem do banco já filtrada, uma
  // página de cada vez (DES-008: antes baixava as 1.000 mais recentes e a
  // busca não achava as mais antigas).
  const base = () => supabase.from("nfce_emitidas").select("id", { count: "exact", head: true });
  const contar = (f: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => f(base()).then(({ count }) => count ?? 0);
  const [lista, emitidas, canceladas, erro, valores] = await Promise.all([
    consultarNotas(supabase, filtro, pagina),
    contar((q) => q.eq("status", "autorizado")),
    contar((q) => q.eq("status", "cancelado")),
    contar((q) => q.or("status.is.null,status.not.in.(autorizado,cancelado)")),
    // Soma no banco (DES-008, migration 0301).
    supabase.rpc("nfce_total_autorizado"),
  ]);
  const valorTotal = Number((valores as { data: unknown }).data) || 0;

  return (
    <div className="pagina">
      <Link href="/salao" className="text-sm font-semibold text-texto-marca hover:underline">← Salão</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto">Notas fiscais</h1>
        <Link href="/salao/notas-fiscais/avulsa" className="btn-principal text-sm">+ Nota avulsa (NF-e / NFC-e)</Link>
      </div>
      <p className="mt-1 text-sm text-texto-suave">
        Notas geradas pelo sistema (NFC-e/NF-e). Ambiente atual das últimas emissões destacado nos cartões.
      </p>

      <NotasClient
        linhas={lista.linhas}
        stats={{ emitidas, valorTotal, canceladas, erro }}
        filtro={filtro}
        pagina={pagina}
        totalFiltro={lista.total}
        porPagina={POR_PAGINA}
      />
    </div>
  );
}
