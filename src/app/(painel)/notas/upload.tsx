"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importarNota } from "./actions";

export function UploadNota() {
  const router = useRouter();
  const [processando, start] = useTransition();
  const [msgs, setMsgs] = useState<{ nome: string; ok: boolean; texto: string }[]>(
    [],
  );

  function aoEscolher(files: FileList | null) {
    if (!files || files.length === 0) return;
    const lista = Array.from(files);
    start(async () => {
      const resultados: { nome: string; ok: boolean; texto: string }[] = [];
      for (const f of lista) {
        const xml = await f.text();
        const r = await importarNota(xml);
        resultados.push({
          nome: f.name,
          ok: !!r?.ok,
          texto: r?.ok
            ? r.fornecedorCasado
              ? "importada e fornecedor reconhecido"
              : "importada (fornecedor não encontrado no cadastro)"
            : (r?.erro ?? "erro"),
        });
      }
      setMsgs(resultados);
      router.refresh();
    });
  }

  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2 min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90">
        {processando ? "Importando..." : "+ Importar XML"}
        <input
          type="file"
          accept=".xml,text/xml,application/xml"
          multiple
          className="hidden"
          disabled={processando}
          onChange={(e) => aoEscolher(e.target.files)}
        />
      </label>
      {msgs.length > 0 && (
        <div className="mt-3 space-y-1">
          {msgs.map((m, i) => (
            <p
              key={i}
              className={`text-xs ${m.ok ? "text-green-600" : "text-red-600"}`}
            >
              {m.ok ? "✓" : "✗"} {m.nome}: {m.texto}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
