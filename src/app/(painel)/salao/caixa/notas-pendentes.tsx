"use client";

// Fila da nota automática, sempre visível no caixa: cada conta paga em Pix,
// cartão ou vale espera alguns minutos antes de virar nota. Nesse tempo dá pra
// digitar o CPF (se o cliente pedir), mandar emitir na hora ou dispensar.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelarNotaPendente, emitirNotaPendenteAgora, salvarCpfPendente } from "./pendentes-actions";

export type Pendente = {
  id: string;
  numeros: string | null;
  valor: number;
  formas: string | null;
  cpfCnpj: string | null;
  status: string;
  erro: string | null;
  emitirEm: string;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function faltam(iso: string, agora: number) {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - agora) / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function NotasPendentes({ lista }: { lista: Pendente[] }) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [cpf, setCpf] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [agora, setAgora] = useState(() => Date.now());

  // Relógio da contagem regressiva + recarga da lista de tempos em tempos.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(t);
  }, [router]);

  if (lista.length === 0) return null;

  function agir(id: string, fn: () => Promise<{ ok: boolean; mensagem?: string }>) {
    setMsg((s) => ({ ...s, [id]: "…" }));
    start(async () => {
      const r = await fn();
      setMsg((s) => ({ ...s, [id]: r.ok ? "✓" : r.mensagem ?? "não deu certo" }));
      router.refresh();
    });
  }

  const campo =
    "w-40 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="mb-3 rounded-2xl border border-emerald-300 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
      <p className="mb-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">
        🧾 Notas saindo automaticamente
        <span className="ml-2 text-xs font-normal text-emerald-700/70 dark:text-emerald-400/70">
          o cliente pediu CPF? digite antes do tempo acabar
        </span>
      </p>
      <ul className="space-y-2">
        {lista.map((p) => {
          const restante = faltam(p.emitirEm, agora);
          const vencido = new Date(p.emitirEm).getTime() <= agora;
          const comErro = p.status === "erro";
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2.5 dark:bg-zinc-900"
            >
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                {p.numeros || "Comanda"}
              </span>
              <span className="text-sm text-zinc-500">{brl(p.valor)}</span>
              {p.formas && <span className="text-xs text-zinc-400">{p.formas}</span>}

              {comErro ? (
                <span className="rounded-lg bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                  não autorizou{p.erro ? `: ${p.erro}` : ""}
                </span>
              ) : (
                <span
                  className={`rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${
                    vencido
                      ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                  }`}
                >
                  {vencido ? "emitindo…" : `sai em ${restante}`}
                </span>
              )}

              <input
                value={cpf[p.id] ?? p.cpfCnpj ?? ""}
                onChange={(e) => setCpf((s) => ({ ...s, [p.id]: e.target.value }))}
                onBlur={() => {
                  const v = (cpf[p.id] ?? "").trim();
                  if (v && v !== (p.cpfCnpj ?? "")) agir(p.id, () => salvarCpfPendente(p.id, v));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") agir(p.id, () => emitirNotaPendenteAgora(p.id, (cpf[p.id] ?? "").trim()));
                }}
                inputMode="numeric"
                placeholder="CPF ou CNPJ"
                className={campo}
              />
              <button
                onClick={() => agir(p.id, () => emitirNotaPendenteAgora(p.id, (cpf[p.id] ?? "").trim()))}
                disabled={proc}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Emitir agora
              </button>
              <button
                onClick={() => {
                  if (!confirm(`Não emitir a nota de ${p.numeros || "esta conta"}?`)) return;
                  agir(p.id, () => cancelarNotaPendente(p.id));
                }}
                disabled={proc}
                className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs text-zinc-500 dark:border-zinc-700"
              >
                Sem nota
              </button>
              {msg[p.id] && (
                <span className={`text-xs ${msg[p.id] === "✓" ? "text-emerald-600" : "text-red-600"}`}>{msg[p.id]}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
