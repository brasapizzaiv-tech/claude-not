"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { adicionarItemComanda } from "../../actions";

export function QRComanda({ id }: { id: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url =
      (typeof window !== "undefined" ? window.location.origin : "") +
      `/salao/comandas/${id}`;
    QRCode.toDataURL(url, { width: 200, margin: 1 }).then(setSrc).catch(() => {});
  }, [id]);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="QR" className="h-28 w-28" />;
}

type Item = { id: string; nome: string; categoria: string | null; preco: number };

export function AddItem({
  comandaId,
  itens,
}: {
  comandaId: string;
  itens: Item[];
}) {
  const [sel, setSel] = useState("");
  const [p, start] = useTransition();
  const router = useRouter();

  const grupos = new Map<string, Item[]>();
  for (const i of itens) {
    const k = i.categoria || "Outros";
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  }

  function add() {
    if (!sel) return;
    start(async () => {
      await adicionarItemComanda(comandaId, sel);
      setSel("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <select
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="min-w-56 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <option value="">+ adicionar item do cardápio...</option>
        {[...grupos.entries()].map(([cat, its]) => (
          <optgroup key={cat} label={cat}>
            {its.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome} — {Number(i.preco).toFixed(2).replace(".", ",")}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button
        onClick={add}
        disabled={p || !sel}
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
      >
        Adicionar
      </button>
    </div>
  );
}
