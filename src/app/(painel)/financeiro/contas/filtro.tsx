"use client";

import { useRouter } from "next/navigation";

export function FiltroCategoria({
  opcoes,
  atual,
  verPagas,
}: {
  opcoes: { id: string; nome: string }[];
  atual: string;
  verPagas: boolean;
}) {
  const router = useRouter();
  return (
    <select
      value={atual}
      onChange={(e) => {
        const p = new URLSearchParams();
        if (verPagas) p.set("ver", "pagas");
        if (e.target.value) p.set("cat", e.target.value);
        const qs = p.toString();
        router.push(`/financeiro/contas${qs ? `?${qs}` : ""}`);
      }}
      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <option value="">Todas as categorias</option>
      {opcoes.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nome}
        </option>
      ))}
    </select>
  );
}
