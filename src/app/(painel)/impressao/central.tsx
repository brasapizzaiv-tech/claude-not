"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarImpressora, criarImpressoraDetectada, renomearImpressora, definirImpressoraAtiva, definirImpressoraWindows, definirRecebeComandas, definirComandaCategorias,
} from "./actions";

export type Impressora = { id: string; nome: string; ativo: boolean; impressora_windows: string | null; recebe_comandas: boolean; comanda_categorias: string[] | null };

export function CentralImpressao({
  impressoras, categorias, token, hostname, printersPc, online, vistoEm,
}: {
  impressoras: Impressora[];
  categorias: string[];
  token: string;
  hostname: string | null;
  printersPc: string[];
  online: boolean;
  vistoEm: string | null;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [novo, setNovo] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [verConfig, setVerConfig] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  function run(fn: () => Promise<unknown>) {
    start(async () => { await fn(); router.refresh(); });
  }

  const jaCadastradas = new Set(impressoras.map((i) => (i.impressora_windows || "").toLowerCase()));
  const detectadasNovas = printersPc.filter((p) => !jaCadastradas.has(p.toLowerCase()));
  const vistoTxt = vistoEm ? new Date(vistoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">🖨️ Central de Impressões</h1>
      <p className="mb-5 text-sm text-zinc-500">
        Aqui ficam <b>todas as impressoras</b> (etiquetas hoje; comandas e cupons no futuro). As impressões saem por um
        <b> PC central</b> com o <b>Agente</b> instalado.
      </p>

      {/* Status do agente / PC responsável */}
      <div className={`mb-4 rounded-2xl border p-4 ${online ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} />
            <span className="font-bold text-zinc-900 dark:text-zinc-50">
              {online ? "Agente conectado" : "Agente não conectado"}
            </span>
          </div>
          <span className="text-sm text-zinc-500">
            {hostname ? `PC: ${hostname}` : "Nenhum PC vinculado ainda"}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {online
            ? `Recebendo as impressões normalmente.${vistoTxt ? ` Último sinal: ${vistoTxt}.` : ""}`
            : "Instale o Agente no PC responsável (ou verifique se ele está aberto). Enquanto isso, nada será impresso."}
        </p>
        <button onClick={() => setVerConfig((v) => !v)} className="mt-2 text-xs text-blue-500 underline">
          {verConfig ? "esconder" : "ver"} dados do agente (endereço/token)
        </button>
        {verConfig && (
          <div className="mt-2 space-y-2 rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
            <div className="flex flex-wrap items-center gap-2"><span className="w-20 shrink-0 text-zinc-400">Endereço:</span><code className="rounded bg-white px-2 py-0.5 dark:bg-zinc-900">{baseUrl}</code></div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 shrink-0 text-zinc-400">Token:</span>
              <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-0.5 dark:bg-zinc-900">{token}</code>
              <button onClick={() => { navigator.clipboard?.writeText(token); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }} className="rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700">{copiado ? "Copiado!" : "Copiar"}</button>
            </div>
          </div>
        )}
      </div>

      {/* Impressoras detectadas ainda não cadastradas */}
      {online && detectadasNovas.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
          <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">Impressoras detectadas no PC (ainda não usadas):</p>
          <div className="flex flex-wrap gap-2">
            {detectadasNovas.map((p) => (
              <button key={p} disabled={proc} onClick={() => run(() => criarImpressoraDetectada(p))} className="rounded-lg border border-blue-400 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-500/10">
                + {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Impressoras cadastradas */}
      <h2 className="mb-2 font-bold text-zinc-900 dark:text-zinc-50">Impressoras</h2>
      <div className="space-y-2">
        {impressoras.length === 0 && <p className="text-sm text-zinc-500">Nenhuma impressora ainda. Adicione uma detectada acima, ou manualmente abaixo.</p>}
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
                <WinField im={im} printersPc={printersPc} proc={proc} run={run} />
                <label className="mt-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <input type="checkbox" checked={im.recebe_comandas} disabled={proc} onChange={(e) => run(() => definirRecebeComandas(im.id, e.target.checked))} />
                  🍳 Recebe comandas (cozinha/bar)
                </label>
                {im.recebe_comandas && <ViaCategorias im={im} categorias={categorias} proc={proc} run={run} />}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nome da nova impressora (ex.: Cozinha, Bar)" className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
        <button disabled={proc || !novo.trim()} onClick={() => { run(() => criarImpressora(novo)); setNovo(""); }} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          + Adicionar impressora
        </button>
      </div>
    </div>
  );
}

function ViaCategorias({ im, categorias, proc, run }: {
  im: Impressora; categorias: string[]; proc: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
  const [sel, setSel] = useState<string[]>(im.comanda_categorias ?? []);
  const cls = (on: boolean) =>
    `rounded-full px-2.5 py-1 text-xs font-medium ${on ? "bg-orange-500 text-white" : "border border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"}`;

  function salvar(novo: string[]) { setSel(novo); run(() => definirComandaCategorias(im.id, novo)); }
  const toggle = (cat: string) => salvar(sel.includes(cat) ? sel.filter((c) => c !== cat) : [...sel, cat]);

  return (
    <div className="mt-2 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/40">
      <div className="mb-1.5 text-xs text-zinc-500">Imprime as categorias {sel.length === 0 ? "(todas)" : `(${sel.length})`}:</div>
      <div className="flex flex-wrap gap-1.5">
        <button disabled={proc} onClick={() => salvar([])} className={cls(sel.length === 0)}>Todas</button>
        {categorias.map((cat) => (
          <button key={cat} disabled={proc} onClick={() => toggle(cat)} className={cls(sel.includes(cat))}>{cat}</button>
        ))}
      </div>
    </div>
  );
}

function WinField({ im, printersPc, proc, run }: {
  im: Impressora; printersPc: string[]; proc: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
  const [val, setVal] = useState(im.impressora_windows ?? "");
  const mudou = val.trim() !== (im.impressora_windows ?? "");
  const temLista = printersPc.length > 0;
  // se o valor atual não está na lista detectada, oferece opção "outro"
  const naLista = printersPc.some((p) => p === val);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-400">Impressora no PC:</span>
      {temLista ? (
        <select
          value={naLista || val === "" ? val : "__outro__"}
          onChange={(e) => setVal(e.target.value === "__outro__" ? " " : e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
        >
          <option value="">(escolher)</option>
          {printersPc.map((p) => <option key={p} value={p}>{p}</option>)}
          <option value="__outro__">Outro (digitar)…</option>
        </select>
      ) : null}
      {(!temLista || !naLista) && (
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="ex.: ELGIN L42PRO FULL"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
        />
      )}
      {mudou && (
        <button disabled={proc} onClick={() => run(() => definirImpressoraWindows(im.id, val))} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white">Salvar</button>
      )}
    </div>
  );
}
