"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function BaixaPublica({
  id,
  statusInicial,
}: {
  id: string;
  statusInicial: string;
}) {
  const [status, setStatus] = useState(statusInicial);
  const [carregando, setCarregando] = useState<"usada" | "descartada" | null>(
    null,
  );

  async function baixar(novo: "usada" | "descartada") {
    setCarregando(novo);
    const supabase = createClient();
    const { data } = await supabase.rpc("etiqueta_baixa_scan", {
      p_id: id,
      p_status: novo,
    });
    const res = data as { ok?: boolean; status?: string } | null;
    if (res?.ok) setStatus(res.status ?? novo);
    setCarregando(null);
  }

  if (status !== "ativa") {
    return (
      <div className="mt-4 rounded-xl bg-zinc-200 p-3 text-center text-sm font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        {status === "usada" ? "✓ Baixa registrada (usada)" : "Descartada"}
      </div>
    );
  }

  return (
    <div className="mt-4 flex gap-2">
      <button
        onClick={() => baixar("usada")}
        disabled={!!carregando}
        className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
      >
        {carregando === "usada" ? "..." : "Dar baixa"}
      </button>
      <button
        onClick={() => baixar("descartada")}
        disabled={!!carregando}
        className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-500 hover:text-red-600 disabled:opacity-60 dark:border-zinc-700"
      >
        {carregando === "descartada" ? "..." : "Descartar"}
      </button>
    </div>
  );
}
