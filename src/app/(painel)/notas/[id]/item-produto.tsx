"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { vincularItemProduto } from "../actions";
import { Combobox } from "@/components/combobox";

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
    <Combobox
      options={produtos.map((p) => ({ value: p.id, label: p.nome }))}
      value={produtoId ?? ""}
      onChange={(v) =>
        start(async () => {
          await vincularItemProduto(itemId, v || null);
          router.refresh();
        })
      }
      placeholder="— buscar produto —"
      disabled={salvando}
      className={`w-full rounded-controle border px-2 py-1 text-xs outline-none focus:border-orange-500 dark:bg-zinc-950 ${
        produtoId
          ? "border-borda-forte text-texto-suave  "
          : "border-amber-400 text-amber-600"
      }`}
    />
  );
}
