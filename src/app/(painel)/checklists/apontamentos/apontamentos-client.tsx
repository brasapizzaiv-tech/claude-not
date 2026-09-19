"use client";

import { useState, useTransition } from "react";
import { confirmar } from "@/components/dialogo";
import { useRouter } from "next/navigation";
import { dataCurta, type Apontamento } from "@/lib/checklists-core";
import { excluirApontamentoPainel, resolverApontamentoPainel, tirarApontamentoDaTv } from "../actions";

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Aba = "tv" | "resolvidos" | "expirados";

export function ApontamentosClient({
  apontamentos, hoje, maisRepetidos,
}: {
  apontamentos: Apontamento[]; hoje: string; maisRepetidos: { texto: string; setor: string | null; n: number }[];
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [aba, setAba] = useState<Aba>("tv");

  const naTv = apontamentos.filter((a) => a.na_tv && !a.resolvido_em && (!a.ate || a.ate >= hoje));
  const resolvidos = apontamentos.filter((a) => a.resolvido_em);
  const expirados = apontamentos.filter((a) => !a.resolvido_em && (!a.na_tv || (a.ate && a.ate < hoje)));
  const lista = aba === "tv" ? naTv : aba === "resolvidos" ? resolvidos : expirados;

  function agir<T>(fn: () => Promise<T>) {
    start(async () => { await fn(); router.refresh(); });
  }
  const abaCls = (a: Aba) =>
    `rounded-controle px-4 py-2 text-sm font-semibold ${aba === a ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "border border-borda-forte text-texto-suave  "}`;

  return (
    <div>
      {maisRepetidos.length > 0 && (
        <div className="mb-5 rounded-cartao border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">O que mais se repete</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {maisRepetidos.map((r, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="w-7 text-right font-bold text-amber-700 dark:text-amber-300">{r.n}×</span>
                <span className="text-zinc-800 dark:text-zinc-100">{r.texto}</span>
                {r.setor && <span className="text-xs text-texto-suave">{r.setor}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <button onClick={() => setAba("tv")} className={abaCls("tv")}>Na TV ({naTv.length})</button>
        <button onClick={() => setAba("resolvidos")} className={abaCls("resolvidos")}>Resolvidos ({resolvidos.length})</button>
        <button onClick={() => setAba("expirados")} className={abaCls("expirados")}>Fora da TV ({expirados.length})</button>
      </div>

      {lista.length === 0 ? (
        <p className="rounded-cartao bg-painel-cartao p-10 text-center text-texto-fraco">Nada por aqui.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-cartao border border-borda dark:divide-zinc-800">
          {lista.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-2 p-3 text-sm">
              <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-bold dark:bg-zinc-800">{a.setor_nome ?? "geral"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-texto">{a.texto}</p>
                <p className="text-xs text-texto-suave">
                  do dia {dataCurta(a.data_ref)}
                  {a.item_texto ? ` · item "${a.item_texto}"` : " · avulso"}
                  {a.ate ? ` · prazo ${dataCurta(a.ate)}` : ""}
                  {a.publicado_por ? ` · publicado por ${a.publicado_por}` : ""}
                  {a.resolvido_em ? ` · resolvido ${quando(a.resolvido_em)}${a.resolvido_por ? ` por ${a.resolvido_por}` : ""}` : ""}
                </p>
              </div>
              {!a.resolvido_em && (
                <button onClick={() => agir(() => resolverApontamentoPainel(a.id))} disabled={proc} className="rounded-controle border border-emerald-500 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">✓ Resolvido</button>
              )}
              {a.resolvido_em && (
                <button onClick={() => agir(() => resolverApontamentoPainel(a.id, true))} disabled={proc} className="text-xs text-texto-fraco hover:text-amber-600">reabrir</button>
              )}
              {a.na_tv && (
                <button onClick={() => agir(() => tirarApontamentoDaTv(a.id))} disabled={proc} className="text-xs text-texto-fraco hover:text-red-600">tirar da TV</button>
              )}
              <button
                onClick={async () => { if (await confirmar("Apagar este apontamento?")) agir(() => excluirApontamentoPainel(a.id)); }}
                disabled={proc}
                className="text-xs text-zinc-300 hover:text-red-600 dark:text-zinc-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
