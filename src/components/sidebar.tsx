"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { type ModuloKey } from "@/lib/permissoes";
import { Icone, type NomeIcone } from "@/components/icone";
import { TEMA_PADRAO, type Tema } from "@/lib/tema";
import { SeletorTema } from "@/components/seletor-tema";

// Menu lateral — barra estreita só de ícones (72 px).
//
// Por que assim: o sistema tem 7 grupos e cerca de 40 telas. Em 72 px cabem os
// 7 ícones de grupo, não as 40 telas. Então a barra mostra os grupos, e clicar
// num deles abre um painel ao lado com as telas daquele grupo. O conteúdo ganha
// ~176 px de largura, que é onde as tabelas agradecem.
//
// No celular continua o menu que desliza por cima, porque já existia e dá conta
// das 40 telas melhor que uma barra embaixo com 5 lugares.

type Item = { href: string; label: string; icon: NomeIcone; external?: boolean; aviso?: number };
type Grupo = { key: string; label: string; icon: NomeIcone; itens: Item[]; aviso?: number };

const RAIL = 72; // largura da barra, em pixels
const K_ABERTOS = "sidebar_grupos";

// Quais grupos estão abertos no menu do celular, lembrado no navegador.
const ouvintes = new Set<() => void>();
function subscribe(cb: () => void) {
  ouvintes.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    ouvintes.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function lerAbertosRaw() {
  try { return localStorage.getItem(K_ABERTOS) || "{}"; } catch { return "{}"; }
}
function gravarAbertos(v: Record<string, boolean>) {
  try { localStorage.setItem(K_ABERTOS, JSON.stringify(v)); } catch {}
  ouvintes.forEach((f) => f());
}

// Rodinha no item que a pessoa acabou de clicar, enquanto a tela vem.
// Só funciona dentro de um <Link>.
function Rodinha() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-borda-forte border-t-primaria"
    />
  );
}

// Botão da barra estreita. Fora do componente de cima: componente criado
// dentro do render perde o estado a cada desenho.
function BotaoRail({
  icone, rotulo, ativo, aviso, onClick, href,
}: {
  icone: NomeIcone; rotulo: string; ativo: boolean; aviso?: number;
  onClick?: () => void; href?: string;
}) {
  // 44 px de alvo, que é o mínimo confortável pro dedo.
  const cls = `group relative flex h-11 w-11 items-center justify-center rounded-controle transition ${
      ativo ? "bg-superficie-suave text-primaria" : "text-texto-suave hover:bg-superficie-suave hover:text-texto"
    }`;
  const dentro = (
    <>
      <Icone nome={icone} tamanho={21} />
      {!!aviso && <Badge n={aviso} canto />}
      {/* O nome aparece ao lado quando o mouse passa. */}
      <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-controle bg-texto px-2 py-1 text-xs font-medium text-fundo group-hover:block">
        {rotulo}
      </span>
    </>
  );
  return href ? (
    <Link href={href} aria-label={rotulo} className={cls}>{dentro}</Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={rotulo} aria-expanded={ativo} className={cls}>
      {dentro}
    </button>
  );
}

function Badge({ n, canto = false }: { n: number; canto?: boolean }) {
  return (
    <span
      className={`flex h-4 min-w-4 items-center justify-center rounded-full bg-erro px-1 text-mini font-bold text-white ${
        canto ? "absolute -right-0.5 -top-0.5" : ""
      }`}
    >
      {n > 9 ? "9+" : n}
    </span>
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
  logoUrl = "/logo-brasa.png",
}: {
  nome: string;
  papel: string;
  admin: boolean;
  permissoes: string[];
  reservasNovas?: number;
  pedidosCompra?: number;
  tema?: Tema;
  /** Logo da empresa. Vem do cadastro (Etapa 3); o padrão é o da Brasa. */
  logoUrl?: string;
}) {
  const pathname = usePathname();
  const abertosRaw = useSyncExternalStore(subscribe, lerAbertosRaw, () => "{}");
  // O que está aberto guarda TAMBÉM em qual tela abriu. Assim, quando a pessoa
  // troca de tela, o painel se fecha sozinho por dedução — sem precisar de um
  // efeito que mexe em estado, que rende renderização em cascata.
  const [flyoutEm, setFlyoutEm] = useState<{ key: string; rota: string } | null>(null);
  const [mobileEm, setMobileEm] = useState<string | null>(null);
  const flyout = flyoutEm?.rota === pathname ? flyoutEm.key : null;
  const mobileAberto = mobileEm === pathname;

  const abrirFlyout = (key: string | null) =>
    setFlyoutEm(key ? { key, rota: pathname } : null);
  const setMobileAberto = (v: boolean) => setMobileEm(v ? pathname : null);

  // Esc fecha o painel.
  useEffect(() => {
    if (!flyout) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") setFlyoutEm(null); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [flyout]);

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
        ...so(has("mural"), { href: "/mural", label: "Mural do escritório", icon: "aparelho" }),
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
        ...so(admin, { href: "/aparencia", label: "Aparência da empresa", icon: "brilho" }),
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
  const noInicio = pathname === "/dashboard";

  let abertos: Record<string, boolean> = {};
  try { abertos = JSON.parse(abertosRaw) as Record<string, boolean>; } catch {}
  const estaAberto = (key: string) => abertos[key] ?? key === grupoAtivo;
  const alternar = (key: string) => gravarAbertos({ ...abertos, [key]: !estaAberto(key) });

  const grupoAberto = grupos.find((g) => g.key === flyout) ?? null;

  // ---------- Botão da barra estreita ----------
  // ---------- A barra estreita (computador) ----------
  const rail = (
    <div className="flex h-full flex-col items-center gap-1 border-r border-borda bg-painel-cartao py-3">
      <Link href="/dashboard" aria-label="Início" className="mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" className="h-10 w-10 rounded-controle object-contain" />
      </Link>

      <BotaoRail icone="inicio" rotulo="Início" ativo={noInicio} href="/dashboard" />

      <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
        {grupos.map((g) => (
          <BotaoRail
            key={g.key}
            icone={g.icon}
            rotulo={g.label}
            aviso={g.aviso}
            ativo={g.key === flyout || (flyout === null && g.key === grupoAtivo)}
            onClick={() => abrirFlyout(flyout === g.key ? null : g.key)}
          />
        ))}
      </nav>

      <div className="flex flex-col items-center gap-1 border-t border-borda pt-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-superficie-suave text-sm font-semibold text-texto"
          title={`${nome} · ${papel}`}
        >
          {(nome?.[0] ?? "U").toUpperCase()}
        </div>
        <SeletorTema inicial={tema} />
        <form action="/auth/signout" method="post">
          <button
            aria-label="Sair"
            title="Sair"
            className="flex h-11 w-11 items-center justify-center rounded-controle text-texto-suave transition hover:bg-superficie-suave hover:text-texto"
          >
            <Icone nome="sair" tamanho={19} />
          </button>
        </form>
      </div>
    </div>
  );

  // ---------- Lista de telas de um grupo ----------
  const listaDoGrupo = (g: Grupo, aoClicar?: () => void) => (
    <div className="flex flex-col gap-0.5">
      {g.itens.map((it) => {
        const ehAtivo = ativo?.href === it.href;
        const cls = `flex items-center gap-2.5 rounded-controle px-2.5 py-2 text-sm transition ${
          ehAtivo ? "bg-superficie-suave font-semibold text-texto" : "text-texto-suave hover:bg-superficie-suave hover:text-texto"
        }`;
        const dentro = (
          <>
            <span className="relative flex h-5 w-5 items-center justify-center">
              <Icone nome={it.icon} tamanho={17} className={ehAtivo ? "text-primaria" : ""} />
            </span>
            <span className="truncate">{it.label}</span>
            {!!it.aviso && <Badge n={it.aviso} />}
          </>
        );
        return it.external ? (
          <a key={it.href} href={it.href} className={cls}>{dentro}</a>
        ) : (
          <Link key={it.href} href={it.href} className={cls} onClick={aoClicar}>
            {dentro}
            <Rodinha />
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      {/* ---------- Celular: barra no topo ---------- */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-borda bg-painel-cartao px-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileAberto(true)}
          aria-label="Abrir menu"
          className="flex h-11 w-11 items-center justify-center rounded-controle text-texto"
        >
          <Icone nome="cards" tamanho={22} />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="" className="h-8 w-8 rounded-controle object-contain" />
          <span className="font-semibold text-texto">Brasa</span>
        </Link>
        {!!reservasNovas && (
          <span className="ml-auto rounded-full bg-erro px-2 py-0.5 text-xs font-bold text-white">
            {reservasNovas} reservas
          </span>
        )}
      </div>
      <div className="h-14 shrink-0 md:hidden" />

      {/* ---------- Celular: menu que desliza por cima ---------- */}
      {mobileAberto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Fechar menu"
            className="absolute inset-0 cursor-default bg-black/50"
            onClick={() => setMobileAberto(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-painel-cartao">
            <div className="flex items-center gap-2 border-b border-borda px-3 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" className="h-9 w-9 rounded-controle object-contain" />
              <span className="flex-1 font-semibold text-texto">Brasa</span>
              <button
                type="button"
                onClick={() => setMobileAberto(false)}
                aria-label="Fechar menu"
                className="flex h-10 w-10 items-center justify-center rounded-controle text-texto-suave"
              >
                <Icone nome="fechar" tamanho={18} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2">
              <Link
                href="/dashboard"
                className={`mb-1 flex items-center gap-2.5 rounded-controle px-2.5 py-2 text-sm ${
                  noInicio ? "bg-superficie-suave font-semibold text-texto" : "text-texto-suave"
                }`}
              >
                <Icone nome="inicio" tamanho={18} className={noInicio ? "text-primaria" : ""} /> Início
              </Link>
              {grupos.map((g) => (
                <div key={g.key} className="mt-1">
                  <button
                    type="button"
                    onClick={() => alternar(g.key)}
                    className="flex w-full items-center gap-2.5 rounded-controle px-2.5 py-2 text-sm font-semibold text-texto"
                  >
                    <Icone nome={g.icon} tamanho={18} className={g.key === grupoAtivo ? "text-primaria" : "text-texto-suave"} />
                    <span className="flex-1 text-left">{g.label}</span>
                    {!!g.aviso && !estaAberto(g.key) && <Badge n={g.aviso} />}
                    <Icone
                      nome="seguir"
                      tamanho={15}
                      className={`text-texto-fraco transition-transform ${estaAberto(g.key) ? "rotate-90" : ""}`}
                    />
                  </button>
                  {estaAberto(g.key) && (
                    <div className="ml-4 border-l border-borda pl-2">
                      {listaDoGrupo(g, () => setMobileAberto(false))}
                    </div>
                  )}
                </div>
              ))}
            </nav>

            <div className="flex items-center gap-2 border-t border-borda px-3 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-superficie-suave text-sm font-semibold text-texto">
                {(nome?.[0] ?? "U").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-medium text-texto">{nome}</p>
                <p className="text-mini text-texto-fraco">{papel}</p>
              </div>
              <SeletorTema inicial={tema} />
              <form action="/auth/signout" method="post">
                <button
                  aria-label="Sair"
                  className="flex h-10 w-10 items-center justify-center rounded-controle text-texto-suave"
                >
                  <Icone nome="sair" tamanho={18} />
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}

      {/* ---------- Computador: barra fixa de 72 px ---------- */}
      <div className="hidden shrink-0 md:block" style={{ width: RAIL }} />
      <aside className="fixed inset-y-0 left-0 z-40 hidden md:block" style={{ width: RAIL }}>
        {rail}
      </aside>

      {/* ---------- Computador: painel do grupo ---------- */}
      {grupoAberto && (
        <>
          <button
            aria-label="Fechar"
            className="fixed inset-0 z-30 hidden cursor-default md:block"
            onClick={() => abrirFlyout(null)}
          />
          <div
            className="fixed inset-y-0 z-40 hidden w-60 border-r border-borda bg-painel-cartao p-2 md:block"
            style={{ left: RAIL }}
          >
            <p className="px-2.5 pb-2 pt-1 text-xs font-semibold tracking-apertada text-texto-fraco">
              {grupoAberto.label}
            </p>
            {listaDoGrupo(grupoAberto, () => abrirFlyout(null))}
          </div>
        </>
      )}
    </>
  );
}
