"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importarOfx } from "./actions";
import { BANCOS } from "@/lib/financeiro";

export function UploadOfx() {
  const router = useRouter();
  const [processando, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [banco, setBanco] = useState(BANCOS[0] ?? "");

  function escolher(file: File | null) {
    if (!file) return;
    if (!banco) {
      setMsg("❌ Escolha o banco primeiro.");
      return;
    }
    start(async () => {
      const texto = await file.text();
      const r = await importarOfx(texto, banco);
      if (r?.ok)
        setMsg(`✓ ${banco}: ${r.novas} nova(s) de ${r.total} transação(ões).`);
      else setMsg(`❌ ${r?.erro ?? "erro"}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={banco}
        onChange={(e) => setBanco(e.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      >
        {BANCOS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
        {processando ? "Importando..." : "+ Importar extrato (OFX)"}
        <input
          type="file"
          accept=".ofx,.qfx,text/plain"
          className="hidden"
          disabled={processando}
          onChange={(e) => {
            escolher(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </label>
      {msg && <p className="w-full text-xs text-zinc-500">{msg}</p>}
    </div>
  );
}
