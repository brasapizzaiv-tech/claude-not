import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { buscarPorLotes, buscarTodas } from "@/lib/supabase/todas";
import { tipoDe } from "@/lib/formas-pagamento";
import { formasParaTipo } from "@/lib/formas-pagamento-server";
import { ReimprimirZ } from "./reimprimir";

export const metadata = { title: "Fechamentos de caixa · Salão" };
export const dynamic = "force-dynamic";

// Fechamentos dos caixas do sistema (Rafael, 24/10/2026): cada dia em duas
// linhas, almoço e noite (pelo horário de abertura do caixa), com vendas por
// forma, 10%, comandas, ticket, sangrias e a quebra do fechamento Z.

const TZ = "America/Sao_Paulo";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const somarDias = (d: string, n: number) => new Date(new Date(`${d}T12:00:00-03:00`).getTime() + n * 86400000).toLocaleDateString("en-CA", { timeZone: TZ });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const horaNum = (iso: string) => Number(new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }));
const diaBR = (d: string) => {
  const dt = new Date(`${d}T12:00:00-03:00`);
  return `${dt.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short" }).replace(".", "")} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
};

type Caixa = {
  id: string; nome: string; aberto_em: string; fechado_em: string | null; saldo_inicial: number;
  dinheiro_contado: number | null; dinheiro_esperado: number | null; quebra: number | null;
  resumo: { operador?: string | null } | null; obs: string | null;
};
type Linha = {
  caixa: Caixa; dia: string; turno: "Almoço" | "Noite";
  vendas: number; dinheiro: number; cartao: number; pix: number; outros: number;
  servico: number; comandas: number; sangrias: number; suprimentos: number;
};

const somaDe = (ls: Linha[], k: "vendas" | "servico" | "comandas" | "sangrias") => ls.reduce((s, l) => s + l[k], 0);

function CartaoTurno({ titulo, ls, destaque }: { titulo: string; ls: Linha[]; destaque?: boolean }) {
  const v = somaDe(ls, "vendas"), n = somaDe(ls, "comandas"), dez = somaDe(ls, "servico");
  return (
    <div className={`rounded-cartao px-5 py-4 ${destaque ? "bg-destaque" : "bg-painel-cartao"}`}>
      <p className="rotulo">{titulo}</p>
      <p className="numero-grande text-[26px] text-texto">{brl(v)}</p>
      <p className="text-xs text-texto-suave">
        {ls.length} caixa{ls.length === 1 ? "" : "s"} · {n} comandas · ticket {n ? brl(v / n) : "—"}
        {dez > 0 ? ` · 10% ${brl(dez)}` : ""}
      </p>
    </div>
  );
}

export default async function FechamentosPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  await exigirAcesso("/salao");
  const sp = await searchParams;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(sp.ate ?? "") ? (sp.ate as string) : hojeSP();
  const de = /^\d{4}-\d{2}-\d{2}$/.test(sp.de ?? "") ? (sp.de as string) : somarDias(ate, -13);
  const db = await createClient();

  const { data: cxRows } = await db
    .from("pdv_caixas")
    .select("id, nome, aberto_em, fechado_em, saldo_inicial, dinheiro_contado, dinheiro_esperado, quebra, resumo, obs")
    .gte("aberto_em", `${de}T03:00:00Z`)
    .lt("aberto_em", `${somarDias(ate, 1)}T03:00:00Z`)
    .order("aberto_em", { ascending: false })
    .limit(500);
  const caixas = (cxRows as Caixa[]) ?? [];
  const ids = caixas.map((c) => c.id);

  // Movimentos em PÁGINAS (um caixa tem ~100; duas semanas passam de 1000, o
  // limite de cada consulta) e em lotes de caixas (a lista de ids vai no endereço).
  type Mov = { caixa_id: string; tipo: string; forma_pagamento: string | null; valor: number; comanda_id: string | null; comanda_ids: string[] | null };
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 60) lotes.push(ids.slice(i, i + 60));
  const [movsPorLote, formas] = await Promise.all([
    Promise.all(lotes.map((lote) => buscarTodas<Mov>((a, b) =>
      db.from("pdv_caixa_mov").select("caixa_id, tipo, forma_pagamento, valor, comanda_id, comanda_ids").in("caixa_id", lote).order("id").range(a, b),
    ))),
    formasParaTipo(),
  ]);
  const movs = movsPorLote.flat();
  // Comandas pagas em cada caixa (uma comanda dividida em vários pagamentos conta uma vez).
  const comandasDoCaixa = new Map<string, Set<string>>();
  for (const m of movs) {
    if (m.tipo !== "venda") continue;
    const s = comandasDoCaixa.get(m.caixa_id) ?? new Set<string>();
    for (const id of m.comanda_ids?.length ? m.comanda_ids : m.comanda_id ? [m.comanda_id] : []) s.add(id);
    comandasDoCaixa.set(m.caixa_id, s);
  }
  const todasComandas = [...new Set([...comandasDoCaixa.values()].flatMap((s) => [...s]))];
  const coms = await buscarPorLotes<{ id: string; servico: number | null }>(todasComandas, (lote) =>
    db.from("pdv_comandas").select("id, servico").in("id", lote),
  );
  const servicoDe = new Map(coms.map((c) => [c.id, Number(c.servico) || 0]));

  const linhas: Linha[] = caixas.map((c) => {
    const l: Linha = {
      caixa: c, dia: diaDe(c.aberto_em), turno: horaNum(c.aberto_em) < 16 ? "Almoço" : "Noite",
      vendas: 0, dinheiro: 0, cartao: 0, pix: 0, outros: 0, servico: 0, comandas: 0, sangrias: 0, suprimentos: 0,
    };
    for (const m of movs) {
      if (m.caixa_id !== c.id) continue;
      const v = Number(m.valor) || 0;
      if (m.tipo === "sangria") l.sangrias += v;
      else if (m.tipo === "suprimento") l.suprimentos += v;
      else if (m.tipo === "venda") {
        l.vendas += v;
        const t = tipoDe(m.forma_pagamento, formas);
        if (t === "dinheiro") l.dinheiro += v;
        else if (t === "credito" || t === "debito" || t === "cartao") l.cartao += v;
        else if (t === "pix" || t === "pix_maquina") l.pix += v;
        else l.outros += v;
      }
    }
    const cs = comandasDoCaixa.get(c.id) ?? new Set<string>();
    l.comandas = cs.size;
    for (const id of cs) l.servico += servicoDe.get(id) ?? 0;
    return l;
  });

  const almoco = linhas.filter((l) => l.turno === "Almoço");
  const noite = linhas.filter((l) => l.turno === "Noite");
  const quebraTotal = linhas.reduce((s, l) => s + (Number(l.caixa.quebra) || 0), 0);
  const dias = [...new Set(linhas.map((l) => l.dia))];

  return (
    <div className="w-full px-4 py-5 md:px-[30px] md:py-[26px]">
      <p className="rotulo"><Link href="/salao/caixa" className="hover:text-texto">Caixa</Link></p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-numero text-[30px] font-bold leading-[1.05] tracking-apertada text-texto">Fechamentos de caixa</h1>
          <p className="mt-1 text-sm text-texto-suave">Cada dia em almoço e noite (pelo horário em que o caixa abriu).</p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-texto-suave">De<input type="date" name="de" defaultValue={de} className="mt-1 block min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto" /></label>
          <label className="text-xs text-texto-suave">Até<input type="date" name="ate" defaultValue={ate} className="mt-1 block min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto" /></label>
          <button type="submit" className="btn-secundario !min-h-11 text-sm">Ver</button>
        </form>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <CartaoTurno titulo="Almoço no período" ls={almoco} destaque />
        <CartaoTurno titulo="Noite no período" ls={noite} />
        <div className="rounded-cartao bg-painel-cartao px-5 py-4">
          <p className="rotulo">Quebra de caixa (dinheiro)</p>
          <p className={`numero-grande text-[26px] ${Math.abs(quebraTotal) >= 0.01 ? (quebraTotal < 0 ? "text-urgente-texto" : "text-texto") : "text-texto"}`}>{brl(quebraTotal)}</p>
          <p className="text-xs text-texto-suave">contado − esperado, somando os caixas fechados</p>
        </div>
      </div>

      <div className="cartao mt-4 overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="rotulo text-left">
            <tr>
              <th className="px-4 py-3">Dia</th>
              <th className="px-2 py-3">Turno</th>
              <th className="px-2 py-3 text-right">Vendas</th>
              <th className="px-2 py-3 text-right">Dinheiro</th>
              <th className="px-2 py-3 text-right">Cartões</th>
              <th className="px-2 py-3 text-right">Pix</th>
              <th className="px-2 py-3 text-right">Outros</th>
              <th className="px-2 py-3 text-right">10%</th>
              <th className="px-2 py-3 text-right">Comandas · ticket</th>
              <th className="px-2 py-3 text-right">Sangrias</th>
              <th className="px-2 py-3 text-right">Esperado × contado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.length === 0 && <tr><td colSpan={12} className="px-4 py-8 text-center text-texto-suave">Nenhum caixa no período.</td></tr>}
            {dias.map((d) => {
              const doDia = linhas.filter((l) => l.dia === d).sort((a, b) => (a.caixa.aberto_em < b.caixa.aberto_em ? -1 : 1));
              return doDia.map((l, i) => {
                const q = Number(l.caixa.quebra) || 0;
                return (
                  <tr key={l.caixa.id} className={i === 0 ? "border-t-2 border-borda-forte" : ""}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-texto">{i === 0 ? diaBR(d) : ""}</td>
                    <td className="px-2 py-2.5">
                      <span className={l.turno === "Noite" ? "pilula pilula-grafite" : "pilula"}>{l.turno}</span>
                      <span className="block text-xs text-texto-fraco">{hora(l.caixa.aberto_em)}–{l.caixa.fechado_em ? hora(l.caixa.fechado_em) : "aberto"}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right font-numero font-bold text-texto">{brl(l.vendas)}</td>
                    <td className="px-2 py-2.5 text-right font-numero text-texto">{brl(l.dinheiro)}</td>
                    <td className="px-2 py-2.5 text-right font-numero text-texto">{brl(l.cartao)}</td>
                    <td className="px-2 py-2.5 text-right font-numero text-texto">{brl(l.pix)}</td>
                    <td className="px-2 py-2.5 text-right font-numero text-texto-suave">{brl(l.outros)}</td>
                    <td className="px-2 py-2.5 text-right font-numero text-texto">{l.servico > 0 ? brl(l.servico) : "—"}</td>
                    <td className="px-2 py-2.5 text-right font-numero text-texto">
                      {l.comandas}
                      <span className="block text-xs text-texto-fraco">{l.comandas ? brl(l.vendas / l.comandas) : "—"}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right font-numero text-texto-suave">{l.sangrias > 0 ? brl(l.sangrias) : "—"}</td>
                    <td className="px-2 py-2.5 text-right font-numero">
                      {l.caixa.dinheiro_contado != null ? (
                        <>
                          <span className="text-texto">{brl(Number(l.caixa.dinheiro_esperado) || 0)} × {brl(Number(l.caixa.dinheiro_contado) || 0)}</span>
                          <span className={`block text-xs font-semibold ${Math.abs(q) < 0.01 ? "text-texto-fraco" : q < 0 ? "text-urgente-texto" : "text-amber-600"}`}>
                            {Math.abs(q) < 0.01 ? "bateu" : `${q < 0 ? "faltou" : "sobrou"} ${brl(Math.abs(q))}`}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-texto-fraco">{l.caixa.fechado_em ? "fechado sem contagem" : "aberto"}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <Link href={`/salao/caixa/movimentos?caixa=${l.caixa.id}`} className="text-xs font-semibold text-texto-marca hover:underline">detalhe</Link>
                      {l.caixa.fechado_em && <ReimprimirZ caixaId={l.caixa.id} />}
                      {(l.caixa.resumo?.operador || l.caixa.obs) && (
                        <span className="block max-w-[180px] truncate text-xs text-texto-fraco" title={[l.caixa.resumo?.operador, l.caixa.obs].filter(Boolean).join(" · ")}>
                          {[l.caixa.resumo?.operador, l.caixa.obs].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
