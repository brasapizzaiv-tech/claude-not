"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Início", icon: "🏠" },
  { href: "/fornecedores", label: "Fornecedores", icon: "🚚" },
  { href: "/produtos", label: "Produtos", icon: "📦" },
  { href: "/categorias", label: "Categorias", icon: "🏷️" },
  { href: "/colaboradores", label: "Colaboradores", icon: "👤" },
  { href: "/contagens", label: "Contagem de estoque", icon: "📋" },
  { href: "/cotacoes", label: "Cotações", icon: "💰", futuro: true },
];

export function Sidebar({ nome, papel }: { nome: string; papel: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
          Sistema de Cotação
        </p>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {links.map((l) => {
          const ativo = pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                ativo
                  ? "bg-orange-50 font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              <span>{l.icon}</span>
              <span className="flex-1">{l.label}</span>
              {l.futuro && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:bg-zinc-800">
                  em breve
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-2 px-2">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {nome}
          </p>
          <p className="text-xs capitalize text-zinc-400">{papel}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
