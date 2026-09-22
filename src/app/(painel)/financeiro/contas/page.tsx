import Link from "next/link";
import { EscolhaComBusca } from "@/components/escolha-com-busca";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { BANCOS, TIPOS_PAGAMENTO } from "@/lib/financeiro";
import { consultarContas, agruparContas, type FiltroContas } from "./consulta";
import { ListaContasView } from "./lista-contas";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const inputCls =
  "rounded-controle border border-borda-forte bg-white px-2 py-1.5 text-sm text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100";

export default async function ContasPagarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const f: FiltroContas = {
    // Filtrar por dia de pagamento só faz sentido em contas pagas.
    status: sp.status || (sp.pde || sp.pate ? "pagas" : "aberto"),
    comp: sp.comp,
    vde: sp.vde,
    vate: sp.vate,
    lde: sp.lde,
    late: sp.late,
    pde: sp.pde,
    pate: sp.pate,
    banco: sp.banco,
    forma: sp.forma,
    cat: sp.cat,
  };

  const supabase = await createClient();
  const [{ data: catData }, linhas] = await Promise.all([
    supabase
      .from("dre_categorias")
      .select("id, nome, tipo")
      .eq("ativo", true)
      .order("nome"),
    consultarContas(f),
  ]);
  // Agrupa lançamentos da mesma nota (por vencimento) numa conta só (o boleto).
  const linhasAgrupadas = agruparContas(linhas);
  const categorias = (
    (catData as { id: string; nome: string; tipo: string }[]) ?? []
  ).filter((c) => c.tipo !== "receita");

  const total = linhasAgrupadas.reduce((s, l) => s + Number(l.valor), 0);
  const querystring = new URLSearchParams(
    Object.entries(f).filter(([, v]) => v) as [string, string][],
  ).toString();

  // Trocar a situação NÃO pode apagar os outros filtros que a pessoa montou.
  const comStatus = (status: string) => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    q.set("status", status);
    return q.toString();
  };

  const aberto = f.status !== "pagas" && f.status !== "todas";

  return (
    <div className="mx-auto max-w-[1200px] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
            Contas a pagar
          </h1>
          <p className="mt-0.5 text-sm text-texto-suave">
            Filtre por competência, vencimento, origem e mais. Baixe o relatório
            para a contabilidade.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/financeiro/contas/export?${querystring}`}
            className="flex min-h-11 items-center rounded-controle bg-superficie-suave px-4 text-sm font-medium text-texto transition hover:bg-borda"
          >
            <Icone nome="baixar" tamanho={14} className="mr-1.5" /> Baixar relatório (Excel)
          </a>
          <Link
            href="/financeiro"
            className="flex min-h-11 items-center rounded-controle border border-borda-forte px-4 text-sm font-medium text-texto-suave transition hover:bg-superficie-suave"
          >
            Lançamentos
          </Link>
        </div>
      </div>

      {/* Situação: botão, não lista suspensa — são três opções e a pessoa
          precisa ver em qual está sem abrir nada. */}
      <div className="mb-3 flex flex-wrap gap-2">
        {([["aberto", "Em aberto"], ["pagas", "Pagas"], ["todas", "Todas"]] as const).map(([v, rot]) => {
          const ativo = (f.status || "aberto") === v;
          return (
            <Link
              key={v}
              href={`/financeiro/contas?${comStatus(v)}`}
              className={`flex min-h-11 items-center rounded-controle px-4 text-sm font-medium transition ${
                ativo
                  ? "bg-texto text-fundo"
                  : "border border-borda-forte text-texto-suave hover:bg-superficie-suave"
              }`}
            >
              {rot}
            </Link>
          );
        })}
      </div>

      {/* Demais filtros */}
      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-3 rounded-cartao bg-painel-cartao p-4"
      >
        <input type="hidden" name="status" value={f.status || "aberto"} />
        <div>
          <label className="mb-1 block text-xs text-texto-fraco">Competência</label>
          <input type="month" name="comp" defaultValue={f.comp} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-fraco">Vencimento de</label>
          <input type="date" name="vde" defaultValue={f.vde} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-fraco">até</label>
          <input type="date" name="vate" defaultValue={f.vate} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-fraco">Lançamento de</label>
          <input type="date" name="lde" defaultValue={f.lde} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-fraco">até</label>
          <input type="date" name="late" defaultValue={f.late} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-fraco">Pago de</label>
          <input type="date" name="pde" defaultValue={f.pde} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-fraco">até</label>
          <input type="date" name="pate" defaultValue={f.pate} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-fraco">Origem (banco)</label>
          <select name="banco" defaultValue={f.banco} className={inputCls}>
            <option value="">Todas</option>
            {BANCOS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-fraco">Tipo pagto.</label>
          <select name="forma" defaultValue={f.forma} className={inputCls}>
            <option value="">Todos</option>
            {TIPOS_PAGAMENTO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-44">
          <label className="mb-1 block text-xs text-texto-fraco">Categoria</label>
          {/* 117 categorias: aqui a pessoa digita e a lista filtra. */}
          <EscolhaComBusca
            name="cat"
            inicial={f.cat ?? ""}
            opcoes={categorias.map((c) => ({ value: c.id, label: c.nome }))}
          />
        </div>
        <button className="flex min-h-11 items-center rounded-controle bg-texto px-4 text-sm font-medium text-fundo transition hover:opacity-90">
          Aplicar
        </button>
        <Link
          href="/financeiro/contas"
          className="flex min-h-11 items-center rounded-controle px-3 text-sm text-texto-suave transition hover:bg-superficie-suave"
        >
          Limpar
        </Link>
      </form>

      {linhasAgrupadas.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-12 text-center text-sm text-texto-fraco">
          Nenhuma conta com esses filtros.
        </div>
      ) : (
        <>
          <ListaContasView linhas={linhasAgrupadas} aberto={aberto} />
          {/* Rodapé: o resumo do que está na tela agora. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-cartao bg-painel-cartao px-4 py-3">
            <p className="text-xs text-texto-fraco">
              {linhasAgrupadas.length} conta{linhasAgrupadas.length === 1 ? "" : "s"}
              {aberto ? " em aberto" : " no filtro"}
            </p>
            <p className="font-numero text-xl font-semibold tracking-apertada text-texto">{moeda(total)}</p>
          </div>
        </>
      )}
    </div>
  );
}
