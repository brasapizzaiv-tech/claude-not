"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { vincularItemProduto } from "../actions";

export function ItemProduto({
  itemId,
  produtoId,
  produtos,
}: {
  itemId: string;
  produtoId: string | null;
  produtos: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [salvando, start] = useTransition();

  return (
    <select
      value={produtoId ?? ""}
      disabled={salvando}
      onChange={(e) =>
        start(async () => {
          await vincularItemProduto(itemId, e.target.value || null);
          router.refresh();
        })
      }
      className={`w-full rounded-md border px-2 py-1 text-xs outline-none focus:border-orange-500 dark:bg-zinc-950 ${
        produtoId
          ? "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          : "border-amber-400 text-amber-600"
      }`}
    >
      <option value="">— vincular produto —</option>
      {produtos.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </select>
  );
}
