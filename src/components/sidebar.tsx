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

  const links: { href: string; label: string; icon: string }[] = [
    { href: "/dashboard", label: "Início", icon: "🏠" },
    ...MODULOS.filter((m) => admin || permissoes.includes(m.key)).map((m) => ({
      href: m.rotas[0],
      label: m.label,
      icon: m.icon,
    })),
  ];
  if (admin) {
    links.push({ href: "/usuarios", label: "Usuários", icon: "🔑" });
  }

  const linkCls =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition";
  const iconeCls = "w-6 shrink-0 text-center text-lg";
  const textoCls =
    "whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100";

  return (
    // Espaço reservado (barra recolhida). A barra real fica por cima no hover.
    <div className="w-16 shrink-0">
      <aside className="group fixed inset-y-0 left-0 z-40 flex w-16 flex-col overflow-hidden border-r border-zinc-200 bg-white transition-[width] duration-200 hover:w-60 hover:shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3 border-b border-zinc-200 px-3 py-4 dark:border-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-brasa.png"
            alt="Brasa"
            className="h-10 w-10 shrink-0 object-contain"
          />
          <p className={`text-sm font-bold text-zinc-900 dark:text-zinc-50 ${textoCls}`}>
            Sistema de Cotação
          </p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {links.map((l) => {
            const ativo = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                title={l.label}
                className={`${linkCls} ${
                  ativo
                    ? "bg-orange-50 font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                <span className={iconeCls}>{l.icon}</span>
                <span className={`flex-1 ${textoCls}`}>{l.label}</span>
              </Link>
            );
          })}
          <a
            href="/marmitas"
            title="Marmitas"
            className={`${linkCls} text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800`}
          >
            <span className={iconeCls}>🍱</span>
            <span className={`flex-1 ${textoCls}`}>Marmitas</span>
          </a>
        </nav>

        <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
          <div className={`mb-1 px-1 ${textoCls}`}>
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {nome}
            </p>
            <p className="text-xs capitalize text-zinc-400">{papel}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              title="Sair"
              className={`${linkCls} w-full text-left text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800`}
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
