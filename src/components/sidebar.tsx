"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULOS } from "@/lib/permissoes";

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

  // A visão do garçom é tela cheia (celular): sem menu lateral.
  if (pathname === "/garcom" || pathname.startsWith("/garcom/")) return null;

  // Sub-itens do Financeiro (aparecem quando o menu abre no hover).
  const financeiroSub: { href: string; label: string; icon: string }[] = [
    { href: "/financeiro", label: "Movimentações", icon: "💵" },
    { href: "/financeiro/contas", label: "Contas a pagar", icon: "📄" },
    { href: "/financeiro/orcamento", label: "Orçamento", icon: "🎯" },
    { href: "/financeiro/banco", label: "Conciliação (banco)", icon: "🏦" },
    { href: "/financeiro/vendas", label: "Vendas", icon: "🛒" },
    { href: "/financeiro/dre", label: "DRE", icon: "📈" },
  ];

  const modulos = MODULOS.filter((m) => admin || permissoes.includes(m.key));

  const linkCls =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition";
  const iconeCls = "w-6 shrink-0 text-center text-lg";
  const textoCls =
    "whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100";

  const ativoDe = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const clsPara = (ativo: boolean) =>
    `${linkCls} ${
      ativo
        ? "bg-white font-semibold text-orange-600"
        : "text-orange-50 hover:bg-white/15"
    }`;

  return (
    // Espaço reservado (barra recolhida). A barra real fica por cima no hover.
    <div className="w-16 shrink-0">
      <aside className="group fixed inset-y-0 left-0 z-40 flex w-16 flex-col overflow-hidden bg-orange-500 transition-[width] duration-200 hover:w-60 hover:shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/20 px-3 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-brasa.png"
            alt="Brasa"
            className="h-10 w-10 shrink-0 rounded-lg bg-white/90 p-1 object-contain"
          />
          <p className={`text-sm font-bold text-white ${textoCls}`}>
            Sistema de Cotação
          </p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          <Link
            href="/dashboard"
            title="Início"
            className={clsPara(ativoDe("/dashboard"))}
          >
            <span className={iconeCls}>🏠</span>
            <span className={`flex-1 ${textoCls}`}>Início</span>
          </Link>

          {modulos.map((m) => {
            // Financeiro vira um grupo com submenu (aparece ao abrir o menu).
            if (m.key === "financeiro") {
              return (
                <div key="financeiro">
                  <Link
                    href="/financeiro"
                    title="Financeiro"
                    className={clsPara(pathname.startsWith("/financeiro"))}
                  >
                    <span className={iconeCls}>{m.icon}</span>
                    <span className={`flex-1 ${textoCls}`}>Financeiro</span>
                  </Link>
                  <div className="hidden space-y-0.5 py-0.5 group-hover:block">
                    {financeiroSub.map((s) => {
                      const ativo =
                        s.href === "/financeiro"
                          ? pathname === "/financeiro"
                          : ativoDe(s.href);
                      return (
                        <Link
                          key={s.href}
                          href={s.href}
                          className={`ml-4 flex items-center gap-2 rounded-lg py-1.5 pl-3 pr-2 text-xs transition ${
                            ativo
                              ? "bg-white font-semibold text-orange-600"
                              : "text-orange-50 hover:bg-white/15"
                          }`}
                        >
                          <span className="w-4 text-center text-sm">{s.icon}</span>
                          <span className="whitespace-nowrap">{s.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }
            return (
              <Link
                key={m.key}
                href={m.rotas[0]}
                title={m.label}
                className={clsPara(ativoDe(m.rotas[0]))}
              >
                <span className={iconeCls}>{m.icon}</span>
                <span className={`flex-1 ${textoCls}`}>{m.label}</span>
              </Link>
            );
          })}

          {admin && (
            <Link
              href="/usuarios"
              title="Usuários"
              className={clsPara(ativoDe("/usuarios"))}
            >
              <span className={iconeCls}>🔑</span>
              <span className={`flex-1 ${textoCls}`}>Usuários</span>
            </Link>
          )}

          <a
            href="/marmitas"
            title="Marmitas"
            className={`${linkCls} text-orange-50 hover:bg-white/15`}
          >
            <span className={iconeCls}>🍱</span>
            <span className={`flex-1 ${textoCls}`}>Marmitas</span>
          </a>
        </nav>

        <div className="border-t border-white/20 p-2">
          <div className={`mb-1 px-1 ${textoCls}`}>
            <p className="truncate text-sm font-medium text-white">{nome}</p>
            <p className="text-xs capitalize text-orange-100">{papel}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              title="Sair"
              className={`${linkCls} w-full text-left text-orange-50 hover:bg-white/15`}
            >
              <span className={iconeCls}>🚪</span>
              <span className={`flex-1 ${textoCls}`}>Sair</span>
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
