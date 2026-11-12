import Link from "next/link";
import { Icone } from "@/components/icone";
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

  // DEL-03: o Pix do app de pedidos também tem linha aqui (origem "delivery"),
  // criada junto da cobrança — antes a tela lia colunas que não existem em
  // delivery_pedidos e omitia esses Pix sem avisar.
  const { data: cobs } = await supabase
    .from("pix_cobrancas")
    .select("txid, valor, origem, status, descricao, criado_em, pago_em, valor_devolvido, devolucoes")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(300);

  type Cob = { txid: string; valor: number; origem: string; status: string; descricao: string | null; criado_em: string; pago_em: string | null; valor_devolvido: number; devolucoes: PixLinha["devolucoes"] };

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
  ].sort((a, b) => b.ordem.localeCompare(a.ordem));

  const pagos = linhas.filter((l) => l.status === "pago");
  const totalPago = pagos.reduce((s, l) => s + l.valor, 0);
  const totalDev = pagos.reduce((s, l) => s + l.valorDevolvido, 0);
  const diag = pixDiagnostico();

  return (
    <div className="pagina">
      <Link href="/salao/caixa" className="text-sm font-semibold text-texto-marca hover:underline">← Caixa</Link>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina"><Icone nome="rapido" tamanho={20} className="mr-2" /> Pix recebidos</h1>
          <p className="mt-1 text-sm text-texto-suave">
            Cobranças com QR na tela (caixa, balcão e app). Banco: {diag.banco === "sicoob" ? "Sicoob" : "Sicredi"}
            {diag.ambiente !== "producao" && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-aviso-texto">SANDBOX</span>}
          </p>
        </div>
        <div className="flex gap-1 text-sm">
          {[1, 7, 30].map((d) => (
            <Link key={d} href={`/salao/caixa/pix?dias=${d}`} className={`rounded-controle px-3 py-1.5 ${dias === d ? "bg-orange-500 text-marca-sobre-primaria" : "border border-borda-forte text-texto-suave  "}`}>
              {d === 1 ? "Hoje" : `${d} dias`}
            </Link>
          ))}
        </div>
      </div>

      <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="cartao p-3">
          <p className="text-xs text-texto-suave">Pagos</p>
          <p className="text-xl font-bold">{pagos.length}</p>
        </div>
        <div className="cartao p-3">
          <p className="text-xs text-texto-suave">Recebido</p>
          <p className="text-xl font-bold text-ok-texto">{totalPago.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
        </div>
        <div className="cartao p-3">
          <p className="text-xs text-texto-suave">Devolvido</p>
          <p className="text-xl font-bold text-aviso-texto">{totalDev.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
        </div>
      </div>

      <p className="mb-2 text-xs text-texto-suave">
        <b>Estornar</b> devolve o dinheiro pela API do banco direto pra conta de quem pagou (todo ou parte, até 90 dias). O estorno <b>não</b> reabre a comanda nem mexe no caixa: se precisar, ajuste a conta à parte.
      </p>
      <PixLista linhas={linhas} />
    </div>
  );
}
