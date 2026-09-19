"use client";

import { useState, useSyncExternalStore } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { type ModuloKey } from "@/lib/permissoes";
import { Icone, type NomeIcone } from "@/components/icone";
import { TEMA_PADRAO, type Tema } from "@/lib/tema";
import { SeletorTema } from "@/components/seletor-tema";

// Menu lateral: barra larga com os nomes visíveis e grupos que abrem/fecham ao
// clicar (funciona no toque). Dá pra recolher em ícones (lembra a escolha).
// No celular vira um botão ☰ no topo que abre o menu por cima da tela.

type Item = { href: string; label: string; icon: NomeIcone; external?: boolean; aviso?: number };
type Grupo = { key: string; label: string; icon: NomeIcone; itens: Item[]; aviso?: number };

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

// Rodinha que aparece no item do menu que a pessoa acabou de clicar, enquanto
// a tela vem. Só funciona dentro de um <Link>. Sem isto, clicar numa tela
// pesada parece não ter feito nada e a pessoa clica de novo.
function Rodinha() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  );
}

export function Sidebar({
  nome,
  papel,
  admin,
  permissoes,
  reservasNovas = 0,
  pedidosCompra = 0,
  tema = TEMA_PADRAO,
}: {
  nome: string;
  papel: string;
  admin: boolean;
  permissoes: string[];
  reservasNovas?: number;
  pedidosCompra?: number;
  tema?: Tema;
}) {
  const pathname = usePathname();
  const recolhido = useSyncExternalStore(subscribe, lerRecolhido, () => false);
  const abertosRaw = useSyncExternalStore(subscribe, lerAbertosRaw, () => "{}");
  const [mobileAberto, setMobileAberto] = useState(false);

  // Telas de tela cheia (celular): sem menu lateral.
  if (pathname === "/garcom" || pathname.startsWith("/garcom/") || pathname.startsWith("/reservas/hoje")) return null;
  // Tablet da cozinha e TV: tela cheia, sem menu (o relatório do rodízio mantém o menu).
  if (pathname === "/cozinha" || pathname === "/tv" || pathname.startsWith("/tv/")) return null;

  const has = (key: ModuloKey) => admin || permissoes.includes(key);
  // "só aparece se a pessoa tem a permissão". Tipado como Item (e não genérico)
  // pra o TypeScript conferir o nome do ícone de cada linha do menu.
  const so = (cond: boolean, ...v: Item[]) => (cond ? v : []);

  // ---------- Grupos (só com o que o usuário pode ver) ----------
  // Anotado aqui em cima (e não depois do .filter) pra o TypeScript conferir os
  // nomes dos ícones um por um: nome errado vira erro na hora de compilar.
  const todosGrupos: Grupo[] = [
    {
      key: "operacao", label: "Operação", icon: "pizza",
      itens: [
        ...so(has("salao"),
          { href: "/salao", label: "Mesas e comandas", icon: "pizza" },
          { href: "/salao/caixa", label: "Caixa", icon: "dinheiro" },
        ),
        ...so(has("garcom") || has("salao"), { href: "/garcom", label: "Garçom (celular)", icon: "cozinha" }),
        ...so(has("pdv"), { href: "/pdv", label: "PDV balcão", icon: "cupom" }),
        ...so(has("delivery"), { href: "/delivery", label: "Delivery", icon: "entrega" }),
        ...so(has("salao"),
          { href: "/salao/cardapio", label: "Cardápio e config", icon: "caderno" },
          { href: "/salao/notas-fiscais", label: "Notas fiscais (NFC-e)", icon: "cupom" },
          { href: "/salao/cancelados", label: "Cancelados", icon: "documento" },
        ),
      ],
    },
    {
      key: "cozinha", label: "Cozinha", icon: "panela",
      itens: [
        ...so(has("salao"), { href: "/salao/balanca", label: "Balança do buffet", icon: "balanca" }),
        ...so(has("rodizio"), { href: "/cozinha", label: "Quadro do rodízio (tablet)", icon: "pizza" }),
        ...so(has("rodizio"), { href: "/cozinha/relatorio", label: "Rodízio · relatório", icon: "grafico" }),
        ...so(has("rodizio"), { href: "/cozinha/recados", label: "Recados da TV", icon: "tv" }),
        ...so(has("etiquetas"), { href: "/etiquetas", label: "Etiquetas de validade", icon: "etiqueta" }),
      ],
    },
    {
      key: "estoque", label: "Estoque e compras", icon: "pacote",
      itens: [
        ...so(has("produtos"), { href: "/produtos", label: "Produtos", icon: "pacote" }),
        ...so(has("contagem"), { href: "/contagens", label: "Contagem de estoque", icon: "lista" }),
        ...so(has("cotacoes"), { href: "/cotacoes", label: "Cotações", icon: "moedas" }),
        ...so(has("conferencia"), { href: "/conferencia", label: "Conferência", icon: "entrada" }),
        ...so(has("notas"), { href: "/notas", label: "Notas de entrada", icon: "cupom" }),
        ...so(has("fornecedores"), { href: "/fornecedores", label: "Fornecedores", icon: "caminhao" }),
        ...so(has("solicitacoes"), { href: "/solicitacoes", label: "Pedidos da equipe", icon: "ferramenta", aviso: pedidosCompra || undefined }),
      ],
    },
    {
      key: "equipe", label: "Equipe", icon: "equipe",
      itens: [
        ...so(has("colaboradores"),
          { href: "/colaboradores", label: "Colaboradores", icon: "pessoa" },
          { href: "/colaboradores/semana", label: "Semana e 10%", icon: "horario" },
        ),
        ...so(has("folgas"), { href: "/folgas", label: "Folgas", icon: "folga" }),
        ...so(has("retiradas"), { href: "/retiradas", label: "Compras internas", icon: "compras" }),
        ...so(has("checklists"),
          { href: "/checklists", label: "Checklists de hoje", icon: "checklist" },
          { href: "/checklists/revisao", label: "Revisar checklists", icon: "buscar" },
          { href: "/checklists/modelos", label: "Modelos de checklist", icon: "editar" },
        ),
      ],
    },
    {
      key: "financeiro", label: "Financeiro", icon: "grafico",
      itens: has("financeiro")
        ? [
            { href: "/financeiro", label: "Movimentações", icon: "dinheiro" },
            { href: "/financeiro/caixa", label: "Fechamento de caixa", icon: "calculadora" },
            { href: "/financeiro/cmv", label: "CMV / Consumo", icon: "descendo" },
            { href: "/financeiro/contas", label: "Contas a pagar", icon: "documento" },
            { href: "/financeiro/orcamento", label: "Orçamento", icon: "alvo" },
            { href: "/financeiro/banco", label: "Conciliação bancária", icon: "banco" },
            { href: "/financeiro/fatura", label: "Fatura do cartão", icon: "cartao" },
            { href: "/financeiro/vendas", label: "Vendas", icon: "compras" },
            { href: "/financeiro/vendidos", label: "Produtos vendidos", icon: "pizza" },
            { href: "/financeiro/dre", label: "DRE", icon: "subindo" },
          ]
        : so(has("contas"), { href: "/financeiro/contas", label: "Contas a pagar", icon: "documento" }),
    },
    {
      key: "site", label: "Site e apps", icon: "internet", aviso: reservasNovas || undefined,
      itens: [
        ...so(has("reservas"), { href: "/reservas", label: "Reservas", icon: "agenda", aviso: reservasNovas || undefined }),
        ...so(has("cardapio_dia"), { href: "/cardapio-do-dia", label: "Cardápio do dia", icon: "salao" }),
        { href: "/marmitas", label: "Marmitas (convênio)", icon: "marmita", external: true },
      ],
    },
    {
      key: "config", label: "Configurações", icon: "ajustes",
      itens: [
        ...so(has("financeiro"), { href: "/fiscal", label: "Config fiscal", icon: "cupom" }, { href: "/fiscal/perfis", label: "Perfis fiscais", icon: "etiqueta" }),
        ...so(has("impressao"), { href: "/impressao", label: "Central de impressões", icon: "imprimir" }),
        { href: "/clientes", label: "Clientes (NF-e)", icon: "cracha" },
        ...so(admin, { href: "/usuarios", label: "Usuários e permissões", icon: "chave" }),
      ],
    },
  ];
  const grupos = todosGrupos.filter((g) => g.itens.length > 0);

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
          <Icone nome="inicio" tamanho={20} />
          {!recolhido && <span>Início</span>}
          <Rodinha />
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
                <Icone nome={g.icon} tamanho={20} titulo={g.label} />
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
                <span className="relative flex h-5 w-5 items-center justify-center">
                  <Icone nome={g.icon} tamanho={19} />
                  {!!g.aviso && !abertoG && <Badge n={g.aviso} />}
                </span>
                <span className="flex-1">{g.label}</span>
                <Icone nome="seguir" tamanho={15} className={`text-white/70 transition-transform ${abertoG ? "rotate-90" : ""}`} />
              </button>
              {abertoG && (
                <div className="mt-0.5 mb-1 space-y-0.5 border-l border-white/25 pl-2 ml-4">
                  {g.itens.map((it) => {
                    const ehAtivo = ativo?.href === it.href;
                    const cls = linha(ehAtivo, false);
                    const inner = (
                      <>
                        <span className="relative flex h-5 w-5 items-center justify-center">
                          <Icone nome={it.icon} tamanho={17} />
                          {!!it.aviso && <Badge n={it.aviso} />}
                        </span>
                        <span className="truncate">{it.label}</span>
                      </>
                    );
                    return it.external ? (
                      <a key={it.href} href={it.href} className={cls} title={it.label}>{inner}</a>
                    ) : (
                      <Link key={it.href} href={it.href} className={cls} title={it.label} onClick={() => setMobileAberto(false)}>
                        {inner}
                        <Rodinha />
                      </Link>
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
        <SeletorTema inicial={tema} recolhido={recolhido} />
        <form action="/auth/signout" method="post">
          <button title="Sair" aria-label="Sair" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/90 hover:bg-white/15">
            <Icone nome="sair" tamanho={18} />
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
