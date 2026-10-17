import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/etiqueta-vencimentos";
import { TefLista, type TefLinha } from "./tef-lista";

// Cartões passados no pinpad (TEF): reimprimir a via, cancelar uma venda e
// abrir o menu administrativo do gerenciador. Fica fora da tela de receber.
// Histórico inteiro por período (antes: só 7 dias e no máximo 150 — sumia
// quase metade numa semana de movimento).
export const metadata = { title: "Cartões TEF · Brasa" };
export const dynamic = "force-dynamic";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const valida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const ROT_STATUS: Record<string, string> = { confirmada: "Aprovadas", cancelada: "Canceladas", desfeita: "Desfeitas", aprovada: "Sem confirmação" };

type Busca = { de?: string; ate?: string; q?: string; status?: string };

export default async function TefPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const sp = await searchParams;
  const hoje = hojeSP();
  const de = valida(sp.de) ?? somaDias(hoje, -6);
  const ate = valida(sp.ate) ?? hoje;
  const q = (sp.q ?? "").trim();
  const status = sp.status && ROT_STATUS[sp.status] ? sp.status : "";

  // De 1000 em 1000: o Supabase corta cada consulta em 1000 linhas.
  const supabase = await createClient();
  const todas: TefLinha[] = [];
  for (let ini = 0; ini < 50000; ini += 1000) {
    const { data } = await supabase
      .from("tef_transacoes")
      .select("id, tipo, valor, parcelas, rede, bandeira, nsu, autorizacao, status, mensagem, pan_mascarado, terminal, criado_em, mov_id")
      .gte("criado_em", `${de}T00:00:00-03:00`)
      .lte("criado_em", `${ate}T23:59:59-03:00`)
      .order("criado_em", { ascending: false })
      .order("id")
      .range(ini, ini + 999);
    const pag = (data as TefLinha[]) ?? [];
    todas.push(...pag);
    if (pag.length < 1000) break;
  }

  // Busca: NSU, autorização, final do cartão, bandeira, rede ou valor (12,50).
  const qNum = q.replace(/\./g, "").replace(",", ".");
  const casa = (l: TefLinha) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return [l.nsu, l.autorizacao, l.pan_mascarado, l.bandeira, l.rede].some((v) => (v ?? "").toLowerCase().includes(t)) ||
      (/^\d+(\.\d{1,2})?$/.test(qNum) && Math.abs(Number(l.valor) - Number(qNum)) < 0.005);
  };
  const filtradas = todas.filter((l) => casa(l) && (!status || l.status === status));

  // Resumo do período (o que passou no cartão, pra bater com o extrato da adquirente).
  const aprovadas = todas.filter((l) => l.status === "confirmada");
  const totalAprov = aprovadas.reduce((s, l) => s + Number(l.valor), 0);
  const agrupa = (chave: (l: TefLinha) => string) => {
    const m = new Map<string, { n: number; v: number }>();
    for (const l of aprovadas) {
      const k = chave(l) || "—";
      const a = m.get(k) ?? { n: 0, v: 0 };
      m.set(k, { n: a.n + 1, v: a.v + Number(l.valor) });
    }
    return [...m.entries()].sort((a, b) => b[1].v - a[1].v);
  };
  const porBandeira = agrupa((l) => `${l.bandeira ?? ""}${l.tipo ? ` · ${l.tipo}` : ""}`.trim());
  const porRede = agrupa((l) => l.rede ?? "");
  const contaStatus = (s: string) => todas.filter((l) => l.status === s).length;

  const inicioMes = `${hoje.slice(0, 8)}01`;
  const mesPassadoFim = somaDias(inicioMes, -1);
  const mesPassadoIni = `${mesPassadoFim.slice(0, 8)}01`;
  const atalhos: { rotulo: string; de: string; ate: string }[] = [
    { rotulo: "Hoje", de: hoje, ate: hoje },
    { rotulo: "7 dias", de: somaDias(hoje, -6), ate: hoje },
    { rotulo: "Este mês", de: inicioMes, ate: hoje },
    { rotulo: "Mês passado", de: mesPassadoIni, ate: mesPassadoFim },
    { rotulo: "Tudo", de: "2026-09-01", ate: hoje },
  ];
  const link = (p: Partial<Busca>) => {
    const u = new URLSearchParams({ de, ate, ...(q ? { q } : {}), ...(status ? { status } : {}), ...p } as Record<string, string>);
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k);
    return `/salao/caixa/tef?${u.toString()}`;
  };
  const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const campo = "min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto";

  return (
    <div className="p-4 md:p-6">
      <Link href="/salao/caixa" className="text-sm font-semibold text-texto-marca hover:underline">← Voltar ao caixa
      </Link>
      <div className="mt-2 mb-4">
        <h1 className="font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto"><Icone nome="cartao" tamanho={20} className="mr-2" /> Cartões (TEF)</h1>
        <p className="text-sm text-texto-suave">
          Tudo o que passou no pinpad, por período. Aqui você reimprime a via do cliente, cancela uma venda (o pinpad pede o cartão de novo) e abre o menu administrativo da Elgin.
        </p>
      </div>

      {/* Período e busca */}
      <div className="cartao mb-4 p-4">
        <div className="flex flex-wrap gap-2">
          {atalhos.map((a) => {
            const ativo = a.de === de && a.ate === ate;
            return (
              <Link key={a.rotulo} href={link({ de: a.de, ate: a.ate })} aria-current={ativo ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${ativo ? "bg-texto text-fundo" : "bg-painel-cartao text-texto shadow-controle"}`}>
                {a.rotulo}
              </Link>
            );
          })}
        </div>
        <form className="mt-3 flex flex-wrap items-end gap-2" action="/salao/caixa/tef">
          <label className="text-xs text-texto-suave">De<input type="date" name="de" defaultValue={de} className={`${campo} mt-1 block`} /></label>
          <label className="text-xs text-texto-suave">Até<input type="date" name="ate" defaultValue={ate} className={`${campo} mt-1 block`} /></label>
          <label className="min-w-[220px] flex-1 text-xs text-texto-suave">Buscar
            <input name="q" defaultValue={q} placeholder="NSU, autorização, final do cartão, bandeira ou valor" className={`${campo} mt-1 block w-full`} />
          </label>
          {status && <input type="hidden" name="status" value={status} />}
          <button className="btn-principal text-sm">Ver</button>
        </form>
      </div>

      {/* Resumo do período */}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="cartao p-4">
          <p className="rotulo">Aprovado de {dataBR(de)} a {dataBR(ate)}</p>
          <p className="font-numero text-3xl font-bold text-texto">{brl(totalAprov)}</p>
          <p className="text-sm text-texto-suave">{aprovadas.length} cartões</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.keys(ROT_STATUS).filter((s) => contaStatus(s) > 0).map((s) => (
              <Link key={s} href={link({ status: status === s ? "" : s })}
                className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold ${status === s ? "bg-texto text-fundo" : "bg-superficie-suave text-texto"}`}>
                {ROT_STATUS[s]} <span className="font-numero">{contaStatus(s)}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="cartao p-4">
          <p className="rotulo">Por bandeira</p>
          <ul className="mt-2 space-y-1 text-sm">
            {porBandeira.length === 0 && <li className="text-texto-fraco">—</li>}
            {porBandeira.map(([k, a]) => (
              <li key={k} className="flex justify-between gap-2"><span className="truncate text-texto">{k} <span className="text-texto-fraco">({a.n})</span></span><span className="font-numero text-texto">{brl(a.v)}</span></li>
            ))}
          </ul>
        </div>
        <div className="cartao p-4">
          <p className="rotulo">Por rede (adquirente)</p>
          <ul className="mt-2 space-y-1 text-sm">
            {porRede.length === 0 && <li className="text-texto-fraco">—</li>}
            {porRede.map(([k, a]) => (
              <li key={k} className="flex justify-between gap-2"><span className="truncate text-texto">{k} <span className="text-texto-fraco">({a.n})</span></span><span className="font-numero text-texto">{brl(a.v)}</span></li>
            ))}
          </ul>
        </div>
      </div>

      {(q || status) && (
        <p className="mb-2 text-sm text-texto-suave">
          {filtradas.length} de {todas.length} no período{q ? ` com “${q}”` : ""}{status ? ` · ${ROT_STATUS[status].toLowerCase()}` : ""}.{" "}
          <Link href={link({ q: "", status: "" })} className="font-semibold text-texto-marca hover:underline">Limpar</Link>
        </p>
      )}
      <TefLista linhas={filtradas} />
    </div>
  );
}
