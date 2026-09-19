"use client";
import { Icone } from "@/components/icone";
import { confirmar } from "@/components/dialogo";

// Fila da nota automática, sempre visível no caixa.
//
// Cada conta paga em Pix, cartão ou vale espera alguns minutos antes de virar
// nota. Nesse tempo dá pra digitar o CPF (se o cliente pedir), mandar emitir e
// imprimir na hora, ou dispensar. Passado o prazo a nota sai sozinha, mas SEM
// imprimir — nem todo cliente quer o papel. Assim que a nota sai, a linha SOME
// da tela (reimprimir depois: Salão → Notas fiscais).
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelarNotaPendente,
  emitirNotaPendenteAgora,
  salvarCpfPendente,
} from "./pendentes-actions";

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
    "w-40 rounded-controle border border-borda-forte bg-white px-2 py-1.5 text-sm text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100";
  const aviso = (id: string) =>
    msg[id] ? (
      <span className={msg[id] === "✓" ? "text-xs text-emerald-600" : "text-xs text-red-600"}>{msg[id]}</span>
    ) : null;

  return (
    <div className="mb-3 rounded-cartao border border-emerald-300 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
      <p className="mb-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">
        <Icone nome="cupom" tamanho={15} className="mr-1.5" /> Notas saindo automaticamente
        <span className="ml-2 text-xs font-normal text-emerald-700/70 dark:text-emerald-400/70">
          a nota sai sozinha; o papel só imprime se o cliente pedir
        </span>
      </p>
      <ul className="space-y-2">
        {lista.map((p) => {
          const vencido = new Date(p.emitirEm).getTime() <= agora;
          const comErro = p.status === "erro";
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-cartao bg-painel-cartao p-2.5">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{p.numeros || "Comanda"}</span>
              <span className="text-sm text-texto-suave">{brl(p.valor)}</span>
              {p.formas && <span className="text-xs text-texto-fraco">{p.formas}</span>}

              {comErro ? (
                <span className="rounded-controle bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                  não autorizou{p.erro ? `: ${p.erro}` : ""}
                </span>
              ) : (
                <span
                  className={
                    vencido
                      ? "rounded-controle bg-zinc-200 px-2 py-0.5 text-xs font-bold tabular-nums text-texto-suave dark:bg-zinc-800 "
                      : "rounded-controle bg-amber-100 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                  }
                >
                  {vencido ? "emitindo…" : `sai em ${faltam(p.emitirEm, agora)}`}
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
                title="Emite a nota e já manda o cupom pra impressora"
                className="rounded-controle bg-texto px-3 py-1.5 text-sm font-semibold text-fundo hover:opacity-90 disabled:opacity-50"
              >
                Emitir e imprimir
              </button>
              <button
                onClick={async () => {
                  if (!await confirmar(`Não emitir a nota de ${p.numeros || "esta conta"}?`)) return;
                  agir(p.id, () => cancelarNotaPendente(p.id));
                }}
                disabled={proc}
                className="rounded-controle border border-borda-forte px-2.5 py-1.5 text-xs text-texto-suave"
              >
                Sem nota
              </button>
              {aviso(p.id)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
