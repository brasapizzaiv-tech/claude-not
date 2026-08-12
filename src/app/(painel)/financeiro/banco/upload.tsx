"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importarOfx } from "./actions";

export function UploadOfx() {
  const router = useRouter();
  const [processando, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function escolher(file: File | null) {
    if (!file) return;
    start(async () => {
      const texto = await file.text();
      const r = await importarOfx(texto);
      if (r?.ok)
        setMsg(`✓ ${r.novas} nova(s) de ${r.total} transação(ões) no arquivo.`);
      else setMsg(`❌ ${r?.erro ?? "erro"}`);
      router.refresh();
    });
  }

  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
        {processando ? "Importando..." : "+ Importar extrato (OFX)"}
        <input
          type="file"
          accept=".ofx,.qfx,text/plain"
          className="hidden"
          disabled={processando}
          onChange={(e) => escolher(e.target.files?.[0] ?? null)}
        />
      </label>
      {msg && <p className="mt-2 text-xs text-zinc-500">{msg}</p>}
    </div>
  );
}
