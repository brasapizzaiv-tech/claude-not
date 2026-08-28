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
  aviso?: number; // numerozinho vermelho (ex.: reservas novas)
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
  reservasNovas = 0,
}: {
  nome: string;
  papel: string;
  admin: boolean;
  permissoes: string[];
  reservasNovas?: number;
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState<{ key: string; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Telas de tela cheia (celular): sem menu lateral.
  if (
    pathname === "/garcom" ||
    pathname.startsWith("/garcom/") ||
    pathname.startsWith("/reservas/hoje")
  )
    return null;

  const has = (key: ModuloKey) => admin || permissoes.includes(key);
  const M = Object.fromEntries(MODULOS.map((m) => [m.key, m])) as Record<
    ModuloKey,
    (typeof MODULOS)[number]
  >;

  // Submenus (menos ícones na barra, tudo agrupado — sem precisar rolar).
  const cadastrosSub: Sub[] = [
    has("fornecedores") && { href: "/fornecedores", label: "Fornecedores", desc: "Fornecedores", icon: M.fornecedores.icon },
    has("produtos") && { href: "/produtos", label: "Produtos", desc: "Produtos e categorias", icon: M.produtos.icon },
    has("colaboradores") && { href: "/colaboradores", label: "Colaboradores", desc: "Equipe", icon: M.colaboradores.icon },
    { href: "/clientes", label: "Clientes", desc: "Clientes para NF-e", icon: "🧑" },
  ].filter(Boolean) as Sub[];

  const comprasSub: Sub[] = [
    has("contagem") && { href: "/contagens", label: "Contagem de estoque", desc: "Conte o estoque atual", icon: "📋" },
    has("cotacoes") && { href: "/cotacoes", label: "Cotações", desc: "Cote e compare preços", icon: "💰" },
    has("conferencia") && { href: "/conferencia", label: "Conferência", desc: "Confira os pedidos recebidos", icon: "📥" },
  ].filter(Boolean) as Sub[];

  // Financeiro agora inclui Notas e Config fiscal.
  const financeiroSubFull: Sub[] = [
    ...(has("financeiro") ? financeiroSub : []),
    ...(has("notas") ? [{ href: "/notas", label: "Notas de entrada", desc: "Lançamento de notas de compra", icon: "📥" }] : []),
    ...(has("financeiro") ? [{ href: "/fiscal", label: "Config fiscal", desc: "Emissor, empresa, NFC-e/NF-e", icon: "🧾" }] : []),
  ];

  // Operação: Salão + Reservas + Cardápio do dia + Etiquetas num submenu só.
  const operacaoSub: Sub[] = [
    ...(has("salao")
      ? [
          { href: "/salao", label: "Salão / Mesas", desc: "Mapa de mesas e comandas", icon: "🍕" },
          { href: "/salao/caixa", label: "Caixa", desc: "Frente de caixa e recebimentos", icon: "💰" },
          { href: "/salao/balanca", label: "Balança", desc: "Pesagem do buffet", icon: "⚖️" },
          { href: "/salao/cardapio", label: "Cardápio / Config", desc: "Itens, preços e configurações", icon: "📖" },
          { href: "/salao/notas-fiscais", label: "Notas fiscais", desc: "NFC-e/NF-e emitidas", icon: "🧾" },
          { href: "/salao/cancelados", label: "Cancelados", desc: "Auditoria de exclusões", icon: "🗒️" },
          { href: "/garcom", label: "Garçom", desc: "Tela do garçom (tablet)", icon: "🧑‍🍳" },
        ]
      : []),
    ...(has("reservas") ? [{ href: "/reservas", label: "Reservas", desc: "Agenda de reservas", icon: M.reservas.icon }] : []),
    ...(has("cardapio_dia") ? [{ href: "/cardapio-do-dia", label: "Cardápio do dia", desc: "Cardápio do site", icon: M.cardapio_dia.icon }] : []),
    ...(has("etiquetas") ? [{ href: "/etiquetas", label: "Etiquetas", desc: "Etiquetas de validade", icon: M.etiquetas.icon }] : []),
  ];

  const subItem = (key: string, label: string, icon: string, sub: Sub[], extra?: Partial<Item>): Item[] =>
    sub.length > 0 ? [{ key, href: sub[0].href, label, icon, sub, ...extra }] : [];

  // Monta as seções só com o que o usuário pode ver.
  const cru: Secao[] = [
    { titulo: null, itens: [{ key: "dashboard", href: "/dashboard", label: "Início", icon: "🏠" }] },
    { titulo: "Cadastros", itens: subItem("cadastros", "Cadastros", "🗂️", cadastrosSub) },
    { titulo: "Compras", itens: subItem("compras", "Compras", "🛒", comprasSub) },
    { titulo: "Financeiro", itens: subItem("financeiro", "Financeiro", "📊", financeiroSubFull) },
    { titulo: "Operação", itens: subItem("operacao", "Operação", "🍕", operacaoSub, { aviso: reservasNovas || undefined }) },
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
                  <span className="relative block">
                    <span className={iconeBtn(ativo)}>{it.icon}</span>
                    {!!it.aviso && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {it.aviso > 9 ? "9+" : it.aviso}
                      </span>
                    )}
                  </span>
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
                    s.href === "/financeiro" || s.href === "/salao"
                      ? pathname === s.href
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
