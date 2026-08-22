"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULOS, type ModuloKey } from "@/lib/permissoes";

type Sub = { href: string; label: string; desc: string; icon: string };
type Item = {
  key: string;
  href: string;
  label: string;
  icon: string;
  external?: boolean;
  sub?: Sub[];
};
type Secao = { titulo: string | null; itens: Item[] };

const financeiroSub: Sub[] = [
  { href: "/financeiro", label: "Movimentações", desc: "Lançamentos de receitas e despesas", icon: "💵" },
  { href: "/financeiro/caixa", label: "Fechamento de caixa", desc: "Faturamento do dia por forma de pagamento", icon: "🧮" },
  { href: "/financeiro/cmv", label: "CMV / Consumo", desc: "Consumo real da semana vs meta", icon: "📉" },
  { href: "/financeiro/contas", label: "Contas a pagar", desc: "Boletos e vencimentos", icon: "📄" },
  { href: "/financeiro/orcamento", label: "Orçamento", desc: "Metas de gasto por categoria", icon: "🎯" },
  { href: "/financeiro/banco", label: "Conciliação bancária", desc: "Extrato do banco x lançamentos", icon: "🏦" },
  { href: "/financeiro/vendas", label: "Vendas", desc: "Faturamento e importação", icon: "🛒" },
  { href: "/financeiro/dre", label: "DRE", desc: "Resultado do mês", icon: "📈" },
];

export function Sidebar({
  nome,
  papel,
  admin,
  permissoes,
}: {
  nome: string;
  papel: string;
  admin: boolean;
  permissoes: string[];
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState<{ key: string; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A visão do garçom é tela cheia (celular): sem menu lateral.
  if (pathname === "/garcom" || pathname.startsWith("/garcom/")) return null;

  const has = (key: ModuloKey) => admin || permissoes.includes(key);
  const M = Object.fromEntries(MODULOS.map((m) => [m.key, m])) as Record<
    ModuloKey,
    (typeof MODULOS)[number]
  >;
  const mod = (key: ModuloKey, extra?: Partial<Item>): Item => ({
    key,
    href: M[key].rotas[0],
    label: M[key].label,
    icon: M[key].icon,
    ...extra,
  });

  // Setor de Compras: contagem → cotação → conferência (submenu, como o Financeiro).
  const comprasSub: Sub[] = [
    has("contagem") && { href: "/contagens", label: "Contagem de estoque", desc: "Conte o estoque atual", icon: "📋" },
    has("cotacoes") && { href: "/cotacoes", label: "Cotações", desc: "Cote e compare preços", icon: "💰" },
    has("conferencia") && { href: "/conferencia", label: "Conferência", desc: "Confira os pedidos recebidos", icon: "📥" },
  ].filter(Boolean) as Sub[];

  // Monta as seções só com o que o usuário pode ver.
  const cru: Secao[] = [
    { titulo: null, itens: [{ key: "dashboard", href: "/dashboard", label: "Início", icon: "🏠" }] },
    {
      titulo: "Cadastros",
      itens: [
        has("fornecedores") && mod("fornecedores"),
        has("produtos") && mod("produtos"),
        has("colaboradores") && mod("colaboradores"),
        { key: "clientes", href: "/clientes", label: "Clientes", icon: "🧑" },
      ].filter(Boolean) as Item[],
    },
    {
      titulo: "Compras",
      itens: (comprasSub.length > 0
        ? [{ key: "compras", href: comprasSub[0].href, label: "Compras", icon: "🛒", sub: comprasSub }]
        : []) as Item[],
    },
    {
      titulo: "Financeiro",
      itens: [
        has("financeiro") && mod("financeiro", { label: "Financeiro", sub: financeiroSub }),
        has("notas") && mod("notas"),
        { key: "fiscal", href: "/fiscal", label: "Config fiscal", icon: "🧾" },
      ].filter(Boolean) as Item[],
    },
    {
      titulo: "Operação",
      itens: [
        has("salao") && mod("salao"),
        has("salao") && { key: "caixa", href: "/salao/caixa", label: "Caixa", icon: "💰" },
        has("salao") && { key: "balanca", href: "/salao/balanca", label: "Balança", icon: "⚖️" },
        has("etiquetas") && mod("etiquetas"),
      ].filter(Boolean) as Item[],
    },
    {
      titulo: "Apps",
      itens: [{ key: "marmitas", href: "/marmitas", label: "Marmitas", icon: "🍱", external: true }],
    },
  ];
  if (admin) {
    cru.push({ titulo: null, itens: [{ key: "usuarios", href: "/usuarios", label: "Usuários", icon: "🔑" }] });
  }
  const secoes = cru.filter((s) => s.itens.length > 0);
  const todos = secoes.flatMap((s) => s.itens);

  const ativoDe = (item: Item) => {
    if (item.sub)
      return item.sub.some(
        (s) => pathname === s.href || pathname.startsWith(s.href + "/"),
      );
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

  function entrar(key: string, e: React.MouseEvent<HTMLElement>) {
    if (timer.current) clearTimeout(timer.current);
    const r = e.currentTarget.getBoundingClientRect();
    setAberto({ key, top: r.top });
  }
  function sair() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAberto(null), 140);
  }
  function segurar() {
    if (timer.current) clearTimeout(timer.current);
  }
  function fechar() {
    if (timer.current) clearTimeout(timer.current);
    setAberto(null);
  }

  const itemAberto = aberto ? todos.find((i) => i.key === aberto.key) : null;
  const alturaFly = itemAberto?.sub ? itemAberto.sub.length * 58 + 56 : 40;
  const topFly = aberto
    ? Math.max(
        8,
        Math.min(
          aberto.top,
          (typeof window !== "undefined" ? window.innerHeight : 900) - alturaFly - 12,
        ),
      )
    : 0;

  const iconeBtn = (ativo: boolean) =>
    `flex h-11 w-11 items-center justify-center rounded-xl text-xl transition ${
      ativo ? "bg-white text-[#C78340] shadow" : "text-white/90 hover:bg-white/15"
    }`;

  return (
    <div className="w-16 shrink-0">
      <style>{`.sidebar-nav::-webkit-scrollbar{width:0;height:0}.sidebar-nav{scrollbar-width:none}`}</style>
      <aside className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col items-center overflow-visible bg-[#C78340]">
        {/* Logo */}
        <Link href="/dashboard" className="mt-3 mb-1 shrink-0" title="Início">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-brasa.png"
            alt="Brasa"
            className="h-10 w-10 rounded-lg bg-white/90 p-1 object-contain"
          />
        </Link>

        {/* Navegação — rola quando não couber na altura da tela (telas baixas) */}
        <nav className="sidebar-nav flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden py-2">
          {secoes.map((s, si) => (
            <div key={si} className="flex w-full flex-col items-center">
              {s.titulo && (
                <p className="mt-2 mb-0.5 w-full text-center text-[9px] font-bold uppercase tracking-wide text-white/60">
                  {s.titulo}
                </p>
              )}
              {s.itens.map((it) => {
                const ativo = ativoDe(it);
                const conteudo = (
                  <span className={iconeBtn(ativo)}>{it.icon}</span>
                );
                return (
                  <div
                    key={it.key}
                    className="py-0.5"
                    onMouseEnter={(e) => entrar(it.key, e)}
                    onMouseLeave={sair}
                  >
                    {it.external ? (
                      <a href={it.href} title={it.label}>
                        {conteudo}
                      </a>
                    ) : (
                      <Link href={it.href} title={it.label}>
                        {conteudo}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Rodapé: usuário + sair */}
        <div className="mb-3 flex shrink-0 flex-col items-center gap-1">
          <div
            className="py-0.5"
            onMouseEnter={(e) => entrar("__user", e)}
            onMouseLeave={sair}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
              {(nome?.[0] ?? "U").toUpperCase()}
            </div>
          </div>
          <form action="/auth/signout" method="post">
            <button
              title="Sair"
              onMouseEnter={(e) => entrar("__sair", e)}
              onMouseLeave={sair}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-lg text-white/90 transition hover:bg-white/15"
            >
              🚪
            </button>
          </form>
        </div>
      </aside>

      {/* Painel flutuante (flyout) */}
      {aberto && (
        <div
          className="fixed z-50"
          style={{ left: 60, top: topFly }}
          onMouseEnter={segurar}
          onMouseLeave={sair}
        >
          {itemAberto?.sub ? (
            <div className="ml-1 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
              <p className="border-b border-zinc-100 px-4 py-2 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                {itemAberto.label}
              </p>
              <div className="p-1">
                {itemAberto.sub.map((s) => {
                  const at =
                    s.href === "/financeiro"
                      ? pathname === "/financeiro"
                      : pathname === s.href || pathname.startsWith(s.href + "/");
                  return (
                    <Link
                      key={s.href}
                      href={s.href}
                      onClick={fechar}
                      className={`flex items-start gap-3 rounded-lg px-3 py-2 transition ${
                        at
                          ? "bg-[#f6ece0] dark:bg-[#2a2016]"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <span className="mt-0.5 text-lg">{s.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                          {s.label}
                        </span>
                        <span className="block text-xs text-zinc-500">{s.desc}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : aberto.key === "__user" ? (
            <div className="ml-1 rounded-xl border border-zinc-200 bg-white px-4 py-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{nome}</p>
              <p className="text-xs capitalize text-zinc-500">{papel}</p>
            </div>
          ) : (
            <div className="ml-1 whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-[#C78340] shadow-2xl dark:bg-zinc-900 dark:text-[#e0a568]">
              {aberto.key === "__sair"
                ? "Sair"
                : todos.find((i) => i.key === aberto.key)?.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
