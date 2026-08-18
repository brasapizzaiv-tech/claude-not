import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { moedaBR } from "@/lib/format";

type Resumo = {
  faturamento_mes: number;
  faturamento_mes_ant: number;
  notas_mes: number;
  despesas_mes: number;
  contas_aberto: number;
  contas_vencidas: number;
  contas_vencer7: number;
  etiquetas_ativas: number;
  etiquetas_vencendo: number;
  etiquetas_vencidas: number;
  estoque_tem_contagem: boolean;
  estoque_valor: number;
  fornecedores: number;
  produtos: number;
  colaboradores: number;
};

// Paleta dos atalhos (tom suave no claro, translúcido no escuro).
const CORES: Record<string, string> = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  cyan: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300",
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
  teal: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300",
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: resumoData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("nome, papel, permissoes")
      .eq("id", user?.id ?? "")
      .single(),
    supabase.rpc("painel_resumo"),
  ]);

  const admin = profile?.papel === "dono";
  const permissoes = (profile?.permissoes as string[] | null) ?? [];
  const pode = (k: string) => admin || permissoes.includes(k);
  const r = (resumoData as Resumo) ?? ({} as Resumo);

  const mesBruto = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const mesNome = mesBruto.charAt(0).toUpperCase() + mesBruto.slice(1);
  const primeiroNome = (profile?.nome ?? "").split(" ")[0];
  const iniciais = ((profile?.nome as string) ?? "U")
    .split(" ")
    .slice(0, 2)
    .map((p: string) => p[0])
    .join("")
    .toUpperCase();

  const pctFat =
    r.faturamento_mes_ant > 0
      ? Math.round((r.faturamento_mes / r.faturamento_mes_ant - 1) * 100)
      : null;

  const atalhos = [
    { perm: "cotacoes", href: "/cotacoes", icon: "💰", label: "Cotações", cor: "green" },
    { perm: "contagem", href: "/contagens", icon: "📋", label: "Contagem", cor: "blue" },
    { perm: "conferencia", href: "/conferencia", icon: "📥", label: "Conferência", cor: "cyan" },
    { perm: "notas", href: "/notas", icon: "🧾", label: "Notas", cor: "violet" },
    { perm: "financeiro", href: "/financeiro", icon: "📊", label: "Financeiro", cor: "indigo" },
    { perm: "salao", href: "/salao", icon: "🍕", label: "Salão", cor: "orange" },
    { perm: "etiquetas", href: "/etiquetas", icon: "🏷️", label: "Etiquetas", cor: "rose" },
    { perm: "produtos", href: "/produtos", icon: "📦", label: "Produtos", cor: "teal" },
    { perm: "fornecedores", href: "/fornecedores", icon: "🚚", label: "Fornecedores", cor: "amber" },
  ].filter((a) => pode(a.perm));

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      {/* Cabeçalho */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {primeiroNome ? `Olá, ${primeiroNome} 👋` : "Início"}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">Resumo de {mesNome}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
          {iniciais}
        </div>
      </div>

      {/* Destaques (um laranja em evidência) */}
      <div className="grid gap-4 md:grid-cols-3">
        {pode("financeiro") && (
          <Link
            href="/financeiro/vendas"
            className="relative overflow-hidden rounded-3xl bg-orange-500 p-5 text-white transition hover:bg-orange-600"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-orange-100">
              <span className="text-lg">💵</span> Faturamento do mês
            </div>
            <p className="mt-3 text-3xl font-black">{moedaBR(r.faturamento_mes)}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-orange-100">
              {pctFat != null && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 font-semibold">
                  {pctFat >= 0 ? "▲" : "▼"} {Math.abs(pctFat)}%
                </span>
              )}
              <span>mês passado: {moedaBR(r.faturamento_mes_ant)}</span>
            </div>
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
          </Link>
        )}
        {pode("financeiro") && (
          <Destaque
            href="/financeiro/contas"
            icon="📄"
            titulo="Contas a pagar em aberto"
            valor={moedaBR(r.contas_aberto)}
            rodape={
              r.contas_aberto > 0
                ? `${moedaBR(r.contas_vencidas)} vencidas · ${moedaBR(r.contas_vencer7)} vencem em 7 dias`
                : "Nenhuma conta em aberto 🎉"
            }
            cor={r.contas_vencidas > 0 ? "red" : "zinc"}
          />
        )}
        {pode("contagem") && (
          <Destaque
            href="/contagens"
            icon="📦"
            titulo="Valor em estoque"
            valor={r.estoque_tem_contagem ? moedaBR(r.estoque_valor) : "—"}
            rodape={
              r.estoque_tem_contagem
                ? "Última contagem × preço de referência"
                : "Finalize uma contagem para calcular"
            }
            cor="zinc"
          />
        )}
      </div>

      {/* Acesso rápido */}
      {atalhos.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Acesso rápido
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9">
            {atalhos.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-3 text-center transition hover:border-orange-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${CORES[a.cor]}`}
                >
                  {a.icon}
                </span>
                <span className="text-[11px] font-medium leading-tight text-zinc-600 dark:text-zinc-300">
                  {a.label}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Números */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Números
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pode("financeiro") && (
          <Stat href="/financeiro/vendas" icon="🧾" cor="violet" titulo="Notas emitidas no mês" valor={String(r.notas_mes ?? 0)} />
        )}
        {pode("financeiro") && (
          <Stat href="/financeiro" icon="📉" cor="indigo" titulo="Despesas lançadas no mês" valor={moedaBR(r.despesas_mes)} />
        )}
        {pode("etiquetas") && (
          <Stat
            href="/etiquetas"
            icon="🏷️"
            cor="rose"
            titulo="Etiquetas a vencer"
            valor={String((r.etiquetas_vencidas ?? 0) + (r.etiquetas_vencendo ?? 0))}
            detalhe={
              r.etiquetas_vencidas > 0
                ? `${r.etiquetas_vencidas} já vencida(s)`
                : `${r.etiquetas_ativas ?? 0} ativas`
            }
            alerta={r.etiquetas_vencidas > 0}
          />
        )}
        {pode("fornecedores") && (
          <Stat href="/fornecedores" icon="🚚" cor="amber" titulo="Fornecedores" valor={String(r.fornecedores ?? 0)} />
        )}
        {pode("produtos") && (
          <Stat href="/produtos" icon="📦" cor="teal" titulo="Produtos" valor={String(r.produtos ?? 0)} />
        )}
        {pode("colaboradores") && (
          <Stat href="/colaboradores" icon="👤" cor="blue" titulo="Colaboradores" valor={String(r.colaboradores ?? 0)} />
        )}
      </div>
    </div>
  );
}

function Destaque({
  href,
  icon,
  titulo,
  valor,
  rodape,
  cor,
}: {
  href: string;
  icon: string;
  titulo: string;
  valor: string;
  rodape: string;
  cor: "green" | "red" | "zinc";
}) {
  const valorCor =
    cor === "green"
      ? "text-green-600 dark:text-green-400"
      : cor === "red"
        ? "text-red-600 dark:text-red-400"
        : "text-zinc-900 dark:text-zinc-50";
  return (
    <Link
      href={href}
      className="rounded-3xl border border-zinc-200 bg-white p-5 transition hover:border-orange-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-500">
        <span className="text-lg">{icon}</span>
        {titulo}
      </div>
      <p className={`mt-3 text-3xl font-black ${valorCor}`}>{valor}</p>
      <p className="mt-2 text-xs text-zinc-400">{rodape}</p>
    </Link>
  );
}

function Stat({
  href,
  icon,
  titulo,
  valor,
  detalhe,
  alerta,
  cor,
}: {
  href: string;
  icon: string;
  titulo: string;
  valor: string;
  detalhe?: string;
  alerta?: boolean;
  cor: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-orange-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl ${CORES[cor]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p
          className={`text-xl font-bold ${
            alerta ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-50"
          }`}
        >
          {valor}
        </p>
        <p className="truncate text-sm text-zinc-500">{titulo}</p>
        {detalhe && <p className="truncate text-xs text-zinc-400">{detalhe}</p>}
      </div>
    </Link>
  );
}
