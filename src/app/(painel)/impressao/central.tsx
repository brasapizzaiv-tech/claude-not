"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarImpressora, renomearImpressora, definirImpressoraAtiva, definirImpressoraWindows,
} from "./actions";

export type Impressora = { id: string; nome: string; ativo: boolean; impressora_windows: string | null };

export function CentralImpressao({ impressoras, token }: { impressoras: Impressora[]; token: string }) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [novo, setNovo] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [copiado, setCopiado] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  function run(fn: () => Promise<unknown>) {
    start(async () => { await fn(); router.refresh(); });
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">🖨️ Central de Impressões</h1>
      <p className="mb-5 text-sm text-zinc-500">
        Aqui ficam <b>todas as impressoras</b> do sistema (etiquetas hoje; comandas e cupons no futuro). As impressões
        saem por um <b>PC central</b> com o <b>Agente</b> instalado.
      </p>

      {/* Agente / PC central */}
      <div className="mb-6 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-bold text-zinc-900 dark:text-zinc-50">🤖 Agente de impressão (PC central)</h2>
        <p className="mt-1 text-sm text-zinc-500">Instale o agente no computador responsável pelas impressões. Use estes dados no assistente:</p>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-zinc-400">Endereço:</span>
            <code className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">{baseUrl}</code>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-zinc-400">Token:</span>
            <code className="min-w-0 flex-1 truncate rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">{token}</code>
            <button
              onClick={() => { navigator.clipboard?.writeText(token); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }}
              className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
            >
              {copiado ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-400">O token é a senha do agente — não compartilhe.</p>
      </div>

      {/* Impressoras */}
      <h2 className="mb-2 font-bold text-zinc-900 dark:text-zinc-50">Impressoras</h2>
      <div className="space-y-2">
        {impressoras.map((im) => (
          <div key={im.id} className={`rounded-xl border p-3 dark:border-zinc-800 ${im.ativo ? "border-zinc-200" : "border-zinc-200 opacity-60"}`}>
            {editId === im.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
                <button disabled={proc} onClick={() => { run(() => renomearImpressora(im.id, editNome)); setEditId(null); }} className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white">Salvar</button>
                <button onClick={() => setEditId(null)} className="rounded-lg px-3 py-2 text-sm text-zinc-500">Cancelar</button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">🖨️ {im.nome}{im.ativo ? "" : " (inativa)"}</div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditId(im.id); setEditNome(im.nome); }} className="text-sm text-orange-600 hover:underline">renomear</button>
                    <button onClick={() => run(() => definirImpressoraAtiva(im.id, !im.ativo))} className="text-sm text-zinc-400 hover:text-zinc-600">{im.ativo ? "desativar" : "reativar"}</button>
                  </div>
                </div>
                <WinField im={im} proc={proc} run={run} />
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nome da nova impressora (ex.: Cozinha, Bar)" className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
        <button
          disabled={proc || !novo.trim()}
          onClick={() => { run(() => criarImpressora(novo)); setNovo(""); }}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          + Adicionar impressora
        </button>
      </div>
    </div>
  );
}

function WinField({ im, proc, run }: { im: Impressora; proc: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const [val, setVal] = useState(im.impressora_windows ?? "");
  const mudou = val.trim() !== (im.impressora_windows ?? "");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-400">Nome no Windows:</span>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="ex.: ELGIN L42PRO FULL"
        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
      />
      {mudou && (
        <button disabled={proc} onClick={() => run(() => definirImpressoraWindows(im.id, val))} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white">Salvar</button>
      )}
    </div>
  );
}
