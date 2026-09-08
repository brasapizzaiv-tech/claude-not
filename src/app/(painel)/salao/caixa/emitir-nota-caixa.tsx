"use client";

import { useState, useTransition } from "react";
import { emitirNfceComandas, imprimirNfce } from "../fiscal-actions";

// Aparece depois de receber no caixa (e na venda do PDV): emite a NFC-e e
// pergunta se imprime. CPF/CNPJ na nota é opcional.
// juntas = comandas pagas juntas viram UMA nota só (itens e buffet de todas).
export function EmitirNotaCaixa({
  comandas,
  autoIds = [],
  juntas = false,
}: {
  comandas: { id: string; numero: number }[];
  autoIds?: string[];
  juntas?: boolean;
}) {
  const [proc, start] = useTransition();
  const [cpf, setCpf] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Record<string, { ok: boolean; msg: string; url?: string | null; nfceId?: string; impressao?: string }>>({});

  // Grupos a emitir: uma nota por comanda, ou uma nota pra todas (juntas).
  const grupos =
    juntas && comandas.length > 1
      ? [{ key: comandas.map((c) => c.id).join(","), ids: comandas.map((c) => c.id), rotulo: `Comandas nº ${comandas.map((c) => c.numero).join(", ")} (uma nota só)` }]
      : comandas.map((c) => ({ key: c.id, ids: [c.id], rotulo: `Comanda nº ${c.numero}` }));

  // Nota automática (Pix/cartão): a pergunta "CPF ou CNPJ na nota?" fica em
  // destaque e o foco vai pro campo; Enter ou "Sem CPF" emite.
  const autoSet = new Set(autoIds);
  const ehAuto = (g: { ids: string[] }) => g.ids.some((id) => autoSet.has(id));
  const primeiroAuto = grupos.find(ehAuto)?.key;

  function imprimir(key: string) {
    const nfceId = res[key]?.nfceId;
    if (!nfceId) return;
    start(async () => {
      const r = await imprimirNfce(nfceId);
      setRes((s) => ({ ...s, [key]: { ...s[key], impressao: r.ok ? "🖨️ enviada pra impressora" : `⚠️ ${r.mensagem}` } }));
    });
  }

  function emitir(g: { key: string; ids: string[] }, docForcado?: string) {
    start(async () => {
      try {
        const r = await emitirNfceComandas(g.ids, docForcado ?? (cpf[g.key] || ""));
        setRes((s) => ({
          ...s,
          [g.key]: { ok: r.ok, msg: r.ok ? `✓ NFC-e ${r.numero ?? ""} autorizada` : r.mensagem || "não autorizou", url: r.urlDanfe, nfceId: "id" in r ? (r.id as string | undefined) : undefined },
        }));
      } catch {
        setRes((s) => ({ ...s, [g.key]: { ok: false, msg: "Sem conexão. Confira em Notas fiscais antes de tentar de novo." } }));
      }
    });
  }

  if (comandas.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">🧾 {autoIds.length > 0 ? "CPF ou CNPJ na nota?" : "Emitir NFC-e"} {autoIds.length > 0 && <span className="ml-1 text-xs font-normal text-emerald-600">(nota automática: Pix/cartão)</span>}</p>
      <div className="space-y-2">
        {grupos.map((g) => {
          const r = res[g.key];
          const auto = ehAuto(g);
          return (
            <div key={g.key} className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-300">{g.rotulo}</span>
              {!r?.ok && (
                <input
                  autoFocus={g.key === primeiroAuto}
                  value={cpf[g.key] ?? ""}
                  onChange={(e) => setCpf((s) => ({ ...s, [g.key]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter" && !proc) emitir(g); }}
                  inputMode="numeric"
                  placeholder="CPF ou CNPJ (opcional)"
                  className={`w-44 rounded-lg border bg-white px-2 py-1 text-sm dark:bg-zinc-950 ${auto ? "border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900" : "border-zinc-300 dark:border-zinc-700"}`}
                />
              )}
              {r?.ok ? (
                <span className="text-sm font-medium text-emerald-600">{r.msg}</span>
              ) : auto ? (
                <>
                  <button
                    onClick={() => { setCpf((s) => ({ ...s, [g.key]: "" })); emitir(g, ""); }}
                    disabled={proc}
                    className="rounded-lg border border-zinc-300 px-3 py-1 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200"
                  >
                    {proc ? "Emitindo…" : "Sem CPF"}
                  </button>
                  <button
                    onClick={() => emitir(g)}
                    disabled={proc || !(cpf[g.key] ?? "").trim()}
                    className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {proc ? "Emitindo…" : "Com CPF/CNPJ"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => emitir(g)}
                  disabled={proc}
                  className="rounded-lg bg-zinc-800 px-3 py-1 text-sm font-semibold text-white hover:bg-black disabled:opacity-60 dark:bg-zinc-700"
                >
                  {proc ? "Emitindo…" : "Emitir"}
                </button>
              )}
              {r && !r.ok && <span className="text-sm text-red-600">{r.msg}</span>}
              {r?.ok && !r.impressao && r.nfceId && (
                <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-500/10 px-2 py-1 text-sm">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Imprimir nota?</span>
                  <button onClick={() => imprimir(g.key)} disabled={proc} className="rounded-md bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white disabled:opacity-60">Sim</button>
                  <button onClick={() => setRes((s) => ({ ...s, [g.key]: { ...s[g.key], impressao: "sem impressão" } }))} className="rounded-md px-2 py-0.5 text-xs text-zinc-500">Não</button>
                </span>
              )}
              {r?.impressao && <span className="text-sm text-zinc-600 dark:text-zinc-300">{r.impressao}</span>}
              {r?.ok && r.url && (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm text-orange-600 underline">
                  PDF
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
