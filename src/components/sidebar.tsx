"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ModuloKey } from "@/lib/permissoes";

// Menu lateral: barra larga com os nomes visíveis e grupos que abrem/fecham ao
// clicar (funciona no toque). Dá pra recolher em ícones (lembra a escolha).
// No celular vira um botão ☰ no topo que abre o menu por cima da tela.

type Item = { href: string; label: string; icon: string; external?: boolean; aviso?: number };
type Grupo = { key: string; label: string; icon: string; itens: Item[]; aviso?: number };

const LARANJA = "#C78340";
const K_RECOLHIDO = "sidebar_recolhido";
const K_ABERTOS = "sidebar_grupos";

// Estado "recolhido" guardado no navegador, lido sem quebrar a hidratação.
const ouvintes = new Set<() => void>();
function subscribe(cb: () => void) {
  ouvintes.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    ouvintes.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function lerRecolhido() {
  try { return localStorage.getItem(K_RECOLHIDO) === "1"; } catch { return false; }
}
function gravarRecolhido(v: boolean) {
  try { localStorage.setItem(K_RECOLHIDO, v ? "1" : "0"); } catch {}
  ouvintes.forEach((f) => f());
}
function lerAbertosRaw() {
  try { return localStorage.getItem(K_ABERTOS) || "{}"; } catch { return "{}"; }
}
function gravarAbertos(v: Record<string, boolean>) {
  try { localStorage.setItem(K_ABERTOS, JSON.stringify(v)); } catch {}
  ouvintes.forEach((f) => f());
}

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
  const recolhido = useSyncExternalStore(subscribe, lerRecolhido, () => false);
  const abertosRaw = useSyncExternalStore(subscribe, lerAbertosRaw, () => "{}");
  const [mobileAberto, setMobileAberto] = useState(false);

  // Telas de tela cheia (celular): sem menu lateral.
  if (pathname === "/garcom" || pathname.startsWith("/garcom/") || pathname.startsWith("/reservas/hoje")) return null;

  const has = (key: ModuloKey) => admin || permissoes.includes(key);
  const so = <T,>(cond: boolean, ...v: T[]) => (cond ? v : []);

  // ---------- Grupos (só com o que o usuário pode ver) ----------
  const grupos: Grupo[] = [
    {
      key: "operacao", label: "Operação", icon: "🍕",
      itens: [
        ...so(has("salao"),
          { href: "/salao", label: "Mesas e comandas", icon: "🍕" },
          { href: "/salao/caixa", label: "Caixa", icon: "💰" },
        ),
        ...so(has("garcom") || has("salao"), { href: "/garcom", label: "Garçom (celular)", icon: "🧑‍🍳" }),
        ...so(has("pdv"), { href: "/pdv", label: "PDV balcão", icon: "🧾" }),
        ...so(has("delivery"), { href: "/delivery", label: "Delivery", icon: "🛵" }),
        ...so(has("salao"),
          { href: "/salao/cardapio", label: "Cardápio e config", icon: "📖" },
          { href: "/salao/notas-fiscais", label: "Notas fiscais (NFC-e)", icon: "🧾" },
          { href: "/salao/cancelados", label: "Cancelados", icon: "🗒️" },
        ),
      ],
    },
    {
      key: "cozinha", label: "Cozinha", icon: "🍳",
      itens: [
        ...so(has("salao"), { href: "/salao/balanca", label: "Balança do buffet", icon: "⚖️" }),
        ...so(has("etiquetas"), { href: "/etiquetas", label: "Etiquetas de validade", icon: "🏷️" }),
      ],
    },
    {
      key: "estoque", label: "Estoque e compras", icon: "📦",
      itens: [
        ...so(has("produtos"), { href: "/produtos", label: "Produtos", icon: "📦" }),
        ...so(has("contagem"), { href: "/contagens", label: "Contagem de estoque", icon: "📋" }),
        ...so(has("cotacoes"), { href: "/cotacoes", label: "Cotações", icon: "💰" }),
        ...so(has("conferencia"), { href: "/conferencia", label: "Conferência", icon: "📥" }),
        ...so(has("notas"), { href: "/notas", label: "Notas de entrada", icon: "🧾" }),
        ...so(has("fornecedores"), { href: "/fornecedores", label: "Fornecedores", icon: "🚚" }),
      ],
    },
    {
      key: "equipe", label: "Equipe", icon: "👥",
      itens: [
        ...so(has("colaboradores"),
          { href: "/colaboradores", label: "Colaboradores", icon: "👤" },
          { href: "/colaboradores/semana", label: "Semana e 10%", icon: "🗓️" },
        ),
        ...so(has("folgas"), { href: "/folgas", label: "Folgas", icon: "🌴" }),
        ...so(has("retiradas"), { href: "/retiradas", label: "Compras internas", icon: "🛒" }),
      ],
    },
    {
      key: "financeiro", label: "Financeiro", icon: "📊",
      itens: has("financeiro")
        ? [
            { href: "/financeiro", label: "Movimentações", icon: "💵" },
            { href: "/financeiro/caixa", label: "Fechamento de caixa", icon: "🧮" },
            { href: "/financeiro/cmv", label: "CMV / Consumo", icon: "📉" },
            { href: "/financeiro/contas", label: "Contas a pagar", icon: "📄" },
            { href: "/financeiro/orcamento", label: "Orçamento", icon: "🎯" },
            { href: "/financeiro/banco", label: "Conciliação bancária", icon: "🏦" },
            { href: "/financeiro/vendas", label: "Vendas", icon: "🛒" },
            { href: "/financeiro/dre", label: "DRE", icon: "📈" },
          ]
        : so(has("contas"), { href: "/financeiro/contas", label: "Contas a pagar", icon: "📄" }),
    },
    {
      key: "site", label: "Site e apps", icon: "🌐", aviso: reservasNovas || undefined,
      itens: [
        ...so(has("reservas"), { href: "/reservas", label: "Reservas", icon: "📅", aviso: reservasNovas || undefined }),
        ...so(has("cardapio_dia"), { href: "/cardapio-do-dia", label: "Cardápio do dia", icon: "🍽️" }),
        { href: "/marmitas", label: "Marmitas (convênio)", icon: "🍱", external: true },
      ],
    },
    {
      key: "config", label: "Configurações", icon: "⚙️",
      itens: [
        ...so(has("financeiro"), { href: "/fiscal", label: "Config fiscal", icon: "🧾" }),
        ...so(has("impressao"), { href: "/impressao", label: "Central de impressões", icon: "🖨️" }),
        { href: "/clientes", label: "Clientes (NF-e)", icon: "🧑" },
        ...so(admin, { href: "/usuarios", label: "Usuários e permissões", icon: "🔑" }),
      ],
    },
  ].filter((g) => g.itens.length > 0);

  // Item ativo = o de href mais específico que casa com a página atual.
  const todosItens = grupos.flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.key })));
  const ativo = todosItens
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const grupoAtivo = ativo?.grupo ?? null;

  // Grupo aberto: o que o usuário escolheu; o grupo da página atual abre
  // sozinho (a não ser que ele tenha fechado de propósito).
  let abertos: Record<string, boolean> = {};
  try { abertos = JSON.parse(abertosRaw) as Record<string, boolean>; } catch {}
  const estaAberto = (key: string) => abertos[key] ?? key === grupoAtivo;
  function alternar(key: string) {
    gravarAbertos({ ...abertos, [key]: !estaAberto(key) });
  }
  function clicarGrupoRecolhido(key: string) {
    // Recolhido: clicar num grupo expande o menu com esse grupo aberto.
    gravarRecolhido(false);
    gravarAbertos({ ...abertos, [key]: true });
  }

  const largura = recolhido ? "md:w-16" : "md:w-60";

  // No celular (menu por cima) sempre expandido; no desktop respeita "recolhido".
  const render = (recolhido: boolean) => (
    <div className="flex h-full flex-col" style={{ background: LARANJA }}>
      {/* Topo: logo + recolher */}
      <div className={`flex items-center ${recolhido ? "justify-center" : "justify-between"} px-3 pt-3 pb-2`}>
        <Link href="/dashboard" className="flex items-center gap-2" title="Início" onClick={() => setMobileAberto(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-brasa.png" alt="Brasa" className="h-9 w-9 rounded-lg bg-white/90 p-1 object-contain" />
          {!recolhido && <span className="text-base font-bold text-white">Brasa</span>}
        </Link>
        {!recolhido && (
          <button
            type="button"
            onClick={() => gravarRecolhido(true)}
            title="Recolher menu"
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/15 md:flex"
          >
            «
          </button>
        )}
      </div>

      <nav className="sidebar-nav flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
        {/* Início */}
        <Link
          href="/dashboard"
          onClick={() => setMobileAberto(false)}
          title="Início"
          className={linha(pathname === "/dashboard", recolhido)}
        >
          <span className="text-lg">🏠</span>
          {!recolhido && <span>Início</span>}
        </Link>

        {grupos.map((g) => {
          const abertoG = estaAberto(g.key);
          const ativoG = g.key === grupoAtivo;
          if (recolhido) {
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => clicarGrupoRecolhido(g.key)}
                title={g.label}
                className={`relative mt-1 flex h-11 w-full items-center justify-center rounded-xl text-xl transition ${
                  ativoG ? "bg-white text-[#C78340] shadow" : "text-white/90 hover:bg-white/15"
                }`}
              >
                {g.icon}
                {!!g.aviso && <Badge n={g.aviso} />}
              </button>
            );
          }
          return (
            <div key={g.key} className="mt-1">
              <button
                type="button"
                onClick={() => alternar(g.key)}
                className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-semibold transition ${
                  ativoG && !abertoG ? "bg-white/20 text-white" : "text-white hover:bg-white/15"
                }`}
              >
                <span className="relative text-lg">
                  {g.icon}
                  {!!g.aviso && !abertoG && <Badge n={g.aviso} />}
                </span>
                <span className="flex-1">{g.label}</span>
                <span className={`text-xs text-white/70 transition-transform ${abertoG ? "rotate-90" : ""}`}>▶</span>
              </button>
              {abertoG && (
                <div className="mt-0.5 mb-1 space-y-0.5 border-l border-white/25 pl-2 ml-4">
                  {g.itens.map((it) => {
                    const ehAtivo = ativo?.href === it.href;
                    const cls = linha(ehAtivo, false);
                    const inner = (
                      <>
                        <span className="relative text-base">
                          {it.icon}
                          {!!it.aviso && <Badge n={it.aviso} />}
                        </span>
                        <span className="truncate">{it.label}</span>
                      </>
                    );
                    return it.external ? (
                      <a key={it.href} href={it.href} className={cls} title={it.label}>{inner}</a>
                    ) : (
                      <Link key={it.href} href={it.href} className={cls} title={it.label} onClick={() => setMobileAberto(false)}>{inner}</Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Rodapé: usuário + sair (+ expandir quando recolhido) */}
      <div className={`flex items-center gap-2 border-t border-white/20 px-2 py-2 ${recolhido ? "flex-col" : ""}`}>
        {recolhido && (
          <button
            type="button"
            onClick={() => gravarRecolhido(false)}
            title="Expandir menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/15"
          >
            »
          </button>
        )}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/25 text-sm font-bold text-white" title={`${nome} · ${papel}`}>
          {(nome?.[0] ?? "U").toUpperCase()}
        </div>
        {!recolhido && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-white">{nome}</p>
            <p className="text-[11px] text-white/70">{papel}</p>
          </div>
        )}
        <form action="/auth/signout" method="post">
          <button title="Sair" className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-white/90 hover:bg-white/15">
            🚪
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <style>{`.sidebar-nav::-webkit-scrollbar{width:0;height:0}.sidebar-nav{scrollbar-width:none}`}</style>

      {/* Celular: barra no topo com ☰ */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-3 px-3 md:hidden" style={{ background: LARANJA }}>
        <button type="button" onClick={() => setMobileAberto(true)} className="flex h-9 w-9 items-center justify-center rounded-lg text-2xl text-white" aria-label="Abrir menu">
          ☰
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-brasa.png" alt="Brasa" className="h-8 w-8 rounded-lg bg-white/90 p-1 object-contain" />
          <span className="font-bold text-white">Brasa</span>
        </Link>
        {!!reservasNovas && <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{reservasNovas} reservas</span>}
      </div>
      <div className="h-12 shrink-0 md:hidden" />

      {/* Celular: menu por cima */}
      {mobileAberto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileAberto(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            {render(false)}
            <button type="button" onClick={() => setMobileAberto(false)} className="absolute right-2 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-xl text-white/90" aria-label="Fechar menu">
              ✕
            </button>
          </aside>
        </div>
      )}

      {/* Desktop: barra fixa (espaçador + aside) */}
      <div className={`hidden shrink-0 transition-[width] duration-200 md:block ${largura}`} />
      <aside className={`fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 md:block ${largura}`}>
        {render(recolhido)}
      </aside>
    </>
  );
}

function linha(ativo: boolean, recolhido: boolean) {
  return `flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${recolhido ? "justify-center" : ""} ${
    ativo ? "bg-white font-semibold text-[#C78340] shadow" : "text-white/90 hover:bg-white/15"
  }`;
}

function Badge({ n }: { n: number }) {
  return (
    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
      {n > 9 ? "9+" : n}
    </span>
  );
}
