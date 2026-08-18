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

const curto = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n));

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: resumoData }] = await Promise.all([
    supabase.from("profiles").select("nome, papel, permissoes").eq("id", user?.id ?? "").single(),
    supabase.rpc("painel_resumo"),
  ]);

  const admin = profile?.papel === "dono";
  const permissoes = (profile?.permissoes as string[] | null) ?? [];
  const pode = (k: string) => admin || permissoes.includes(k);
  const r = (resumoData as Resumo) ?? ({} as Resumo);

  const hoje = new Date();
  const mesBruto = hoje.toLocaleDateString("pt-BR", { month: "long" });
  const mesNome = mesBruto.charAt(0).toUpperCase() + mesBruto.slice(1);
  const primeiroNome = (profile?.nome ?? "").split(" ")[0];
  const iniciais = ((profile?.nome as string) ?? "U")
    .split(" ")
    .slice(0, 2)
    .map((p: string) => p[0])
    .join("")
    .toUpperCase();

  // Série dos últimos 6 meses (faturamento + despesas).
  const meses: { label: string; ym: string; fat: number; desp: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({
      ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      fat: 0,
      desp: 0,
    });
  }
  if (pode("financeiro")) {
    const inicioISO = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1)
      .toISOString()
      .slice(0, 10);
    const [{ data: notas }, { data: lanc }] = await Promise.all([
      supabase.from("notas_emitidas").select("data_emissao, valor").gte("data_emissao", inicioISO),
      supabase.from("lancamentos").select("data, valor").gte("data", inicioISO),
    ]);
    const idx = new Map(meses.map((m, i) => [m.ym, i]));
    for (const n of (notas as { data_emissao: string; valor: number }[]) ?? []) {
      const i = idx.get((n.data_emissao || "").slice(0, 7));
      if (i != null) meses[i].fat += Number(n.valor) || 0;
    }
    for (const l of (lanc as { data: string; valor: number }[]) ?? []) {
      const i = idx.get((l.data || "").slice(0, 7));
      if (i != null) meses[i].desp += Number(l.valor) || 0;
    }
  }
  const maxFat = Math.max(1, ...meses.map((m) => m.fat));
  const pctFat =
    r.faturamento_mes_ant > 0
      ? Math.round((r.faturamento_mes / r.faturamento_mes_ant - 1) * 100)
      : null;
  const despAtual = meses[5]?.desp ?? 0;
  const despAnt = meses[4]?.desp ?? 0;
  const pctDesp = despAnt > 0 ? Math.round((despAtual / despAnt - 1) * 100) : null;

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

  const alertas = [
    pode("financeiro") && r.contas_vencidas > 0
      ? { icon: "🔴", txt: `${moedaBR(r.contas_vencidas)} em contas vencidas`, href: "/financeiro/contas" }
      : null,
    pode("financeiro") && r.contas_vencer7 > 0
      ? { icon: "🟠", txt: `${moedaBR(r.contas_vencer7)} vencem em 7 dias`, href: "/financeiro/contas" }
      : null,
    pode("etiquetas") && r.etiquetas_vencidas > 0
      ? { icon: "🏷️", txt: `${r.etiquetas_vencidas} etiqueta(s) vencida(s)`, href: "/etiquetas" }
      : null,
    pode("contagem") && !r.estoque_tem_contagem
      ? { icon: "📦", txt: "Nenhuma contagem finalizada ainda", href: "/contagens" }
      : null,
  ].filter(Boolean) as { icon: string; txt: string; href: string }[];

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="space-y-6 lg:col-span-2">
          {/* Destaques */}
          <div className="grid gap-4 sm:grid-cols-3">
            {pode("financeiro") && (
              <Link
                href="/financeiro/vendas"
                className="relative overflow-hidden rounded-3xl bg-orange-500 p-5 text-white transition hover:bg-orange-600"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-orange-100">
                  <span className="text-lg">💵</span> Faturamento
                </div>
                <p className="mt-3 text-2xl font-black">{moedaBR(r.faturamento_mes)}</p>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-100">
                  {pctFat != null && (
                    <span className="rounded-full bg-white/20 px-2 py-0.5 font-semibold">
                      {pctFat >= 0 ? "▲" : "▼"} {Math.abs(pctFat)}%
                    </span>
                  )}
                  <span>vs mês passado</span>
                </div>
                <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
              </Link>
            )}
            {pode("financeiro") && (
              <Destaque
                href="/financeiro/contas"
                icon="📄"
                titulo="Contas a pagar"
                valor={moedaBR(r.contas_aberto)}
                rodape={r.contas_aberto > 0 ? "em aberto" : "nada em aberto 🎉"}
                cor={r.contas_vencidas > 0 ? "red" : "zinc"}
                pct={pctDesp}
                pctLabel="despesas"
              />
            )}
            {pode("contagem") && (
              <Destaque
                href="/contagens"
                icon="📦"
                titulo="Valor em estoque"
                valor={r.estoque_tem_contagem ? moedaBR(r.estoque_valor) : "—"}
                rodape={r.estoque_tem_contagem ? "última contagem" : "finalize uma contagem"}
                cor="zinc"
              />
            )}
          </div>

          {/* Gráfico de faturamento */}
          {pode("financeiro") && (
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-zinc-900 dark:text-zinc-50">Faturamento</h2>
                  <p className="text-xs text-zinc-400">Últimos 6 meses</p>
                </div>
              </div>
              <div className="flex h-44 items-end justify-between gap-2">
                {meses.map((m, i) => {
                  const h = Math.max(3, Math.round((m.fat / maxFat) * 100));
                  const atual = i === meses.length - 1;
                  return (
                    <div key={m.ym} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="text-[10px] font-medium text-zinc-400">
                        {m.fat > 0 ? curto(m.fat) : ""}
                      </span>
                      <div className="flex h-full w-full items-end">
                        <div
                          className={`w-full rounded-t-lg transition-all ${
                            atual ? "bg-orange-500" : "bg-orange-200 dark:bg-orange-500/25"
                          }`}
                          style={{ height: `${h}%` }}
                        />
                      </div>
                      <span className="text-[11px] capitalize text-zinc-500">{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Acesso rápido */}
          {atalhos.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Acesso rápido
              </h2>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {atalhos.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-3 text-center transition hover:border-orange-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${CORES[a.cor]}`}>
                      {a.icon}
                    </span>
                    <span className="text-[11px] font-medium leading-tight text-zinc-600 dark:text-zinc-300">
                      {a.label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Painel lateral */}
        <aside className="space-y-4">
          {/* Precisa de atenção */}
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Precisa de atenção
            </h2>
            {alertas.length === 0 ? (
              <p className="text-sm text-zinc-400">Tudo em dia por aqui 🎉</p>
            ) : (
              <div className="space-y-2">
                {alertas.map((a, i) => (
                  <Link
                    key={i}
                    href={a.href}
                    className="flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <span>{a.icon}</span>
                    <span className="flex-1">{a.txt}</span>
                    <span className="text-zinc-300">›</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Números rápidos */}
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Números</h2>
            <div className="space-y-1">
              {pode("financeiro") && (
                <MiniStat href="/financeiro/vendas" icon="🧾" cor="violet" titulo="Notas no mês" valor={String(r.notas_mes ?? 0)} />
              )}
              {pode("financeiro") && (
                <MiniStat href="/financeiro" icon="📉" cor="indigo" titulo="Despesas no mês" valor={moedaBR(r.despesas_mes)} />
              )}
              {pode("etiquetas") && (
                <MiniStat
                  href="/etiquetas"
                  icon="🏷️"
                  cor="rose"
                  titulo="Etiquetas a vencer"
                  valor={String((r.etiquetas_vencidas ?? 0) + (r.etiquetas_vencendo ?? 0))}
                />
              )}
              {pode("fornecedores") && (
                <MiniStat href="/fornecedores" icon="🚚" cor="amber" titulo="Fornecedores" valor={String(r.fornecedores ?? 0)} />
              )}
              {pode("produtos") && (
                <MiniStat href="/produtos" icon="📦" cor="teal" titulo="Produtos" valor={String(r.produtos ?? 0)} />
              )}
              {pode("colaboradores") && (
                <MiniStat href="/colaboradores" icon="👤" cor="blue" titulo="Colaboradores" valor={String(r.colaboradores ?? 0)} />
              )}
            </div>
          </div>
        </aside>
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
  pct,
  pctLabel,
}: {
  href: string;
  icon: string;
  titulo: string;
  valor: string;
  rodape: string;
  cor: "green" | "red" | "zinc";
  pct?: number | null;
  pctLabel?: string;
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
      <p className={`mt-3 text-2xl font-black ${valorCor}`}>{valor}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
        {pct != null && (
          <span
            className={`rounded-full px-1.5 py-0.5 font-semibold ${
              pct <= 0
                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
            }`}
          >
            {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}%
          </span>
        )}
        <span>{pct != null ? pctLabel : rodape}</span>
      </div>
    </Link>
  );
}

function MiniStat({
  href,
  icon,
  titulo,
  valor,
  cor,
}: {
  href: string;
  icon: string;
  titulo: string;
  valor: string;
  cor: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${CORES[cor]}`}>
        {icon}
      </span>
      <span className="flex-1 truncate text-sm text-zinc-500">{titulo}</span>
      <span className="font-bold text-zinc-900 dark:text-zinc-50">{valor}</span>
    </Link>
  );
}
