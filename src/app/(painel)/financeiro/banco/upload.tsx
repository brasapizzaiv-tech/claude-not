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

  // Os bancos brasileiros mandam o OFX em Latin-1 (ISO-8859-1 / Windows-1252),
  // não em UTF-8. Lido como UTF-8, todo acento vira "�": "RDC AUTOMÁTICO"
  // chegava como "RDC AUTOM�TICO" e ficava assim pra sempre no extrato.
  //
  // O arquivo diz a codificação no cabeçalho (CHARSET), mas nem todo banco
  // preenche direito — então a regra é: tenta UTF-8 e, se aparecer o caractere
  // de "não entendi" (\uFFFD), lê de novo como Latin-1. É o que acerta os dois
  // sem depender da boa vontade do banco.
  async function lerArquivoOfx(file: File): Promise<string> {
    const bytes = await file.arrayBuffer();
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    if (!utf8.includes("\uFFFD")) return utf8;
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      return utf8; // navegador sem esse decodificador: melhor o texto torto do que nada
    }
  }

  function escolher(file: File | null) {
    if (!file) return;
    if (!banco) {
      setMsg("Escolha o banco primeiro.");
      return;
    }
    start(async () => {
      const texto = await lerArquivoOfx(file);
      const r = await importarOfx(texto, banco);
      if (r?.ok)
        setMsg(`✓ ${banco}: ${r.novas} nova(s) de ${r.total} transação(ões)${r.repetidas ? ` · ${r.repetidas} já estavam importadas` : ""}.`);
      else setMsg(r?.erro ?? "erro");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={banco}
        onChange={(e) => setBanco(e.target.value)}
        className="min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
      >
        {BANCOS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <label className="inline-flex cursor-pointer items-center gap-2 min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90">
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
      {msg && <p className="w-full text-xs text-texto-suave">{msg}</p>}
    </div>
  );
}
