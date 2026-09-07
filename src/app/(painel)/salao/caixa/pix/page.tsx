import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pixDiagnostico } from "@/lib/pix";
import { PixLista, type PixLinha } from "./pix-lista";

export const metadata = { title: "Pix recebidos · Caixa" };

// Data-limite (fora do componente por causa da regra de pureza do lint).
function desdeDias(d: number) {
  return new Date(Date.now() - d * 86400_000).toISOString();
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;

export default async function PixRecebidosPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const sp = await searchParams;
  const dias = Math.min(90, Math.max(1, Number(sp.dias) || 7));
  const desde = desdeDias(dias);
  const supabase = await createClient();

  const [{ data: cobs }, { data: peds }] = await Promise.all([
    supabase
      .from("pix_cobrancas")
      .select("txid, valor, origem, status, descricao, criado_em, pago_em, valor_devolvido, devolucoes")
      .gte("criado_em", desde)
      .order("criado_em", { ascending: false })
      .limit(300),
    supabase
      .from("delivery_pedidos")
      .select("numero, total, pix_txid, pix_status, pix_criado_em")
      .not("pix_txid", "is", null)
      .gte("pix_criado_em", desde)
      .order("pix_criado_em", { ascending: false })
      .limit(300),
  ]);

  type Cob = { txid: string; valor: number; origem: string; status: string; descricao: string | null; criado_em: string; pago_em: string | null; valor_devolvido: number; devolucoes: PixLinha["devolucoes"] };
  type Ped = { numero: number; total: number; pix_txid: string; pix_status: string | null; pix_criado_em: string | null };

  const jaTem = new Set(((cobs as Cob[]) ?? []).map((c) => c.txid));
  const linhas: PixLinha[] = [
    ...((cobs as Cob[]) ?? []).map((c) => ({
      txid: c.txid,
      valor: Number(c.valor),
      origem: c.origem,
      status: c.status,
      descricao: c.descricao,
      ordem: c.pago_em ?? c.criado_em,
      criadoEm: fmt(c.criado_em)!,
      pagoEm: fmt(c.pago_em),
      valorDevolvido: Number(c.valor_devolvido ?? 0),
      devolucoes: (c.devolucoes ?? []).map((d) => ({ ...d, em: fmt(d.em) ?? d.em })),
    })),
    // Pix do app de pedidos (delivery) que ainda não têm registro próprio.
    ...((peds as Ped[]) ?? [])
      .filter((p) => !jaTem.has(p.pix_txid))
      .map((p) => ({
        txid: p.pix_txid,
        valor: Number(p.total),
        origem: "delivery",
        status: p.pix_status === "pago" ? "pago" : p.pix_status === "erro" ? "cancelado" : "aguardando",
        descricao: `Pedido #${p.numero}`,
        ordem: p.pix_criado_em ?? "",
        criadoEm: fmt(p.pix_criado_em) ?? "—",
        pagoEm: null,
        valorDevolvido: 0,
        devolucoes: [],
      })),
  ].sort((a, b) => b.ordem.localeCompare(a.ordem));

  const pagos = linhas.filter((l) => l.status === "pago");
  const totalPago = pagos.reduce((s, l) => s + l.valor, 0);
  const totalDev = pagos.reduce((s, l) => s + l.valorDevolvido, 0);
  const diag = pixDiagnostico();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link href="/salao/caixa" className="text-sm text-zinc-500 hover:text-orange-600">← Caixa</Link>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">💠 Pix recebidos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Cobranças com QR na tela (caixa, balcão e app). Banco: {diag.banco === "sicoob" ? "Sicoob" : "Sicredi"}
            {diag.ambiente !== "producao" && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-700">SANDBOX</span>}
          </p>
        </div>
        <div className="flex gap-1 text-sm">
          {[1, 7, 30].map((d) => (
            <Link key={d} href={`/salao/caixa/pix?dias=${d}`} className={`rounded-lg px-3 py-1.5 ${dias === d ? "bg-orange-500 text-white" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>
              {d === 1 ? "Hoje" : `${d} dias`}
            </Link>
          ))}
        </div>
      </div>

      <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Pagos</p>
          <p className="text-xl font-bold">{pagos.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Recebido</p>
          <p className="text-xl font-bold text-emerald-600">{totalPago.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Devolvido</p>
          <p className="text-xl font-bold text-amber-600">{totalDev.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
        </div>
      </div>

      <p className="mb-2 text-xs text-zinc-500">
        <b>Estornar</b> devolve o dinheiro pela API do banco direto pra conta de quem pagou (todo ou parte, até 90 dias). O estorno <b>não</b> reabre a comanda nem mexe no caixa: se precisar, ajuste a conta à parte.
      </p>
      <PixLista linhas={linhas} />
    </div>
  );
}
