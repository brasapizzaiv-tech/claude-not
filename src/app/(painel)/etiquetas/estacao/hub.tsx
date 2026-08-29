"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarImpressora, renomearImpressora, definirImpressoraAtiva } from "../actions";

export type Impressora = { id: string; nome: string; ativo: boolean };

export function EstacaoHub({ impressoras }: { impressoras: Impressora[] }) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [novo, setNovo] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");

  function run(fn: () => Promise<unknown>) {
    start(async () => { await fn(); router.refresh(); });
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link href="/etiquetas" className="text-sm text-zinc-500 hover:text-orange-600">← Etiquetas</Link>
      <h1 className="mt-2 mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Estações de impressão</h1>
      <p className="mb-5 text-sm text-zinc-500">
        Cada impressora tem uma estação. No PC onde a impressora está, abra a estação dela e deixe a aba aberta —
        ela imprime sozinha as etiquetas enviadas para essa impressora.
      </p>

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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">🖨️ {im.nome}{im.ativo ? "" : " (inativa)"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/etiquetas/estacao/${im.id}`} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">Abrir estação</Link>
                  <button onClick={() => { setEditId(im.id); setEditNome(im.nome); }} className="text-sm text-orange-600 hover:underline">renomear</button>
                  <button onClick={() => run(() => definirImpressoraAtiva(im.id, !im.ativo))} className="text-sm text-zinc-400 hover:text-zinc-600">{im.ativo ? "desativar" : "reativar"}</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nome da nova impressora (ex.: Cozinha)" className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
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
