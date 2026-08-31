"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importarNotasEmitidas, importarFaturamentoPlanilha } from "./actions";

// Botão de importar o FATURAMENTO da planilha de custo (almoço + noite).
export function UploadFaturamento() {
  const router = useRouter();
  const [processando, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function escolher(file: File | null) {
    if (!file) return;
    start(async () => {
      const fd = new FormData();
      fd.set("arquivo", file);
      const r = await importarFaturamentoPlanilha(fd);
      if (r?.ok)
        setMsg(`✓ ${r.dias} dia(s), ${r.lancamentos} lançamento(s), total ${r.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
      else setMsg(`❌ ${r?.erro ?? "erro"}`);
      router.refresh();
    });
  }

  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
        {processando ? "Importando..." : "Importar faturamento (planilha)"}
        <input
          type="file"
          accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          disabled={processando}
          onChange={(e) => escolher(e.target.files?.[0] ?? null)}
        />
      </label>
      {msg && <p className="mt-2 text-xs text-zinc-500">{msg}</p>}
    </div>
  );
}

export function UploadVendas() {
  const router = useRouter();
  const [processando, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function escolher(file: File | null) {
    if (!file) return;
    start(async () => {
      const texto = await file.text();
      const r = await importarNotasEmitidas(texto);
      if (r?.ok)
        setMsg(`✓ ${r.novas} nova(s) de ${r.total} no arquivo.`);
      else setMsg(`❌ ${r?.erro ?? "erro"}`);
      router.refresh();
    });
  }

  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950">
        {processando ? "Importando..." : "Atualizar (importar relatório)"}
        <input
          type="file"
          accept=".xls,.html,.htm,text/html"
          className="hidden"
          disabled={processando}
          onChange={(e) => escolher(e.target.files?.[0] ?? null)}
        />
      </label>
      {msg && <p className="mt-2 text-xs text-zinc-500">{msg}</p>}
    </div>
  );
}
