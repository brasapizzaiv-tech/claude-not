"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { salvarOrcamento } from "../actions";

export type LinhaOrc = {
  id: string;
  grupo: string;
  nome: string;
  tipo: string;
  orcado: number;
  realizado: number;
};

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function OrcamentoClient({
  mes,
  linhas,
}: {
  mes: string;
  linhas: LinhaOrc[];
}) {
  const [salvando, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      linhas.map((l) => [l.id, l.orcado ? String(l.orcado) : ""]),
    ),
  );

  const num = (s: string) => Number((s ?? "").replace(/\./g, "").replace(",", ".")) || 0;

  const porGrupo = useMemo(() => {
    const m = new Map<string, LinhaOrc[]>();
    for (const l of linhas) {
      const arr = m.get(l.grupo) ?? [];
      arr.push(l);
      m.set(l.grupo, arr);
    }
    return m;
  }, [linhas]);

  function salvar() {
    start(async () => {
      await salvarOrcamento(
        mes,
        linhas.map((l) => ({ categoria_id: l.id, valor: num(valores[l.id]) })),
      );
      setMsg("Orçamento salvo.");
      setTimeout(() => setMsg(null), 4000);
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={salvar}
          disabled={salvando}
          className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90 disabled:opacity-60"
        >
          {salvando ? "Salvando..." : "Salvar orçamento"}
        </button>
        {msg && <span className="text-sm text-green-600">{msg}</span>}
      </div>

      <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-medium text-texto-fraco">
            <tr>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3 text-right">Orçado</th>
              <th className="px-4 py-3 text-right">Realizado</th>
              <th className="px-4 py-3 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {[...porGrupo.entries()].map(([grupo, ls]) => (
              <Fragment key={grupo}>
                <tr>
                  <td
                    colSpan={4}
                    className="bg-superficie-suave px-4 py-1.5 text-xs font-semibold text-texto-suave"
                  >
                    {grupo}
                  </td>
                </tr>
                {ls.map((l) => {
                  const orc = num(valores[l.id]);
                  const dif = l.realizado - orc;
                  const receita = l.tipo === "receita";
                  // receita: passar da meta é bom; despesa: passar da meta é ruim.
                  const bom = receita ? dif >= 0 : dif <= 0;
                  const temDado = orc > 0 || l.realizado > 0;
                  return (
                    <tr
                      key={l.id}
                      className={`bg-painel-cartao ${temDado ? "" : "opacity-60"}`}
                    >
                      <td className="px-4 py-1.5 text-texto">
                        {l.nome}
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <input
                          inputMode="decimal"
                          placeholder="—"
                          value={valores[l.id] ?? ""}
                          onChange={(e) =>
                            setValores((s) => ({ ...s, [l.id]: e.target.value }))
                          }
                          className="w-24 rounded-controle border border-borda-forte bg-white px-2 py-1 text-right text-sm focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </td>
                      <td className="px-4 py-1.5 text-right text-texto-suave">
                        {l.realizado > 0 ? moeda(l.realizado) : "—"}
                      </td>
                      <td
                        className={`px-4 py-1.5 text-right ${
                          !temDado || orc === 0
                            ? "text-texto-fraco"
                            : bom
                              ? "text-green-600"
                              : "text-red-600"
                        }`}
                      >
                        {orc > 0 ? moeda(dif) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
