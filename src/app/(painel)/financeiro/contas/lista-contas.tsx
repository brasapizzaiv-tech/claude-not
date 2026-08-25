"use client";

import { useMemo, useState } from "react";
import { dataBR } from "@/lib/format";
import { alternarPago, ajustarValorConta } from "../actions";
import type { LinhaConta } from "./consulta";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const curto = (iso: string) => dataBR(iso).slice(0, 5); // 25/08

// Contas com data "AAAA-MM-DD": soma/lê o dia em UTC para não escorregar de fuso.
function addDias(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
function diaDaSemana(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
}
// Segunda-feira da semana do vencimento (semana fecha segunda → domingo).
function segundaDa(iso: string) {
  return addDias(iso, -((diaDaSemana(iso) + 6) % 7));
}

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");


// Valor do boleto: clicar abre a edição. O boleto quase nunca fecha com a nota
// (custas, juros, desconto do banco) — aqui se coloca o valor cobrado de
// verdade. Em conta de nota, a diferença vira uma linha de "Despesas
// Bancárias" e o valor da mercadoria (CMV) fica intacto.
function ValorConta({ l }: { l: LinhaConta }) {
  const [editando, setEditando] = useState(false);
  const custas = Number(l.custas ?? 0);

  if (!editando)
    return (
      <button
        onClick={() => setEditando(true)}
        title="Ajustar o valor cobrado no boleto"
        className="w-full text-right"
      >
        <span className="font-medium text-zinc-800 underline decoration-dotted decoration-zinc-300 underline-offset-4 hover:text-orange-600 dark:text-zinc-200">
          {moeda(Number(l.valor))}
        </span>
        {Math.abs(custas) >= 0.01 && (
          <span className="block text-[11px] text-amber-600">
            {custas > 0 ? "+" : "−"} {moeda(Math.abs(custas))}{" "}
            {custas > 0 ? "de custas" : "de desconto"}
          </span>
        )}
      </button>
    );

  return (
    <form
      action={async (fd: FormData) => {
        await ajustarValorConta(fd);
        setEditando(false);
      }}
      className="flex items-center justify-end gap-1"
    >
      <input type="hidden" name="ids" value={(l.ids ?? [l.id]).join(",")} />
      <input
        name="valor"
        autoFocus
        inputMode="decimal"
        defaultValue={Number(l.valor).toFixed(2).replace(".", ",")}
        className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
      <button
        className="rounded-lg bg-orange-500 px-2 py-1 text-xs font-medium text-white hover:bg-orange-600"
        title="Salvar o valor do boleto"
      >
        ✓
      </button>
      <button
        type="button"
        onClick={() => setEditando(false)}
        className="text-xs text-zinc-400 hover:text-zinc-600"
      >
        ✕
      </button>
    </form>
  );
}

function Linhas({
  itens,
  mostrarPago,
  hojeBR,
}: {
  itens: LinhaConta[];
  mostrarPago?: boolean;
  hojeBR: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {itens.map((l) => (
            <tr key={l.id} className="bg-white dark:bg-zinc-950">
              <td className="px-4 py-2">
                <div className="font-medium text-zinc-900 dark:text-zinc-100">
                  {l.descricao ?? l.fornecedores?.nome ?? "Despesa"}
                </div>
                <div className="text-xs text-zinc-400">
                  {l.dre_categorias?.nome ?? ""}
                  {l.vencimento ? ` · vence ${dataBR(l.vencimento)}` : ""}
                  {l.banco ? ` · ${l.banco}` : ""}
                  {l.forma_pagamento ? ` · ${l.forma_pagamento}` : ""}
                  {mostrarPago && l.pago_em ? ` · pago ${dataBR(l.pago_em)}` : ""}
                </div>
              </td>
              <td className="px-4 py-2 text-right">
                <ValorConta l={l} />
              </td>
              <td className="px-4 py-2 text-right">
                <form action={alternarPago} className="inline-flex items-center gap-1.5">
                  <input type="hidden" name="ids" value={(l.ids ?? [l.id]).join(",")} />
                  <input type="hidden" name="pago" value={l.pago ? "false" : "true"} />
                  {!l.pago && (
                    <input
                      type="date"
                      name="data_pago"
                      defaultValue={hojeBR}
                      title="Data do pagamento (padrão: hoje)"
                      className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-green-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                    />
                  )}
                  <button
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      l.pago
                        ? "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                  >
                    {l.pago ? "Reabrir" : "Pagar"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ListaContasView({
  linhas,
  aberto,
}: {
  linhas: LinhaConta[];
  aberto: boolean;
}) {
  const [busca, setBusca] = useState("");
  const hojeBR = new Date(new Date().getTime() - 3 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const filtradas = useMemo(() => {
    const q = norm(busca.trim());
    if (!q) return linhas;
    return linhas.filter(
      (l) =>
        norm(l.descricao ?? "").includes(q) ||
        norm(l.fornecedores?.nome ?? "").includes(q) ||
        norm(l.dre_categorias?.nome ?? "").includes(q),
    );
  }, [busca, linhas]);

  // Abertas: vencidas em bloco, o resto por DIA, dentro da semana (seg → dom).
  const grupos = useMemo(() => {
    const vencidas: LinhaConta[] = [];
    const semVenc: LinhaConta[] = [];
    const porDia = new Map<string, LinhaConta[]>();
    if (aberto)
      for (const l of filtradas) {
        if (!l.vencimento) semVenc.push(l);
        else if (l.vencimento < hojeBR) vencidas.push(l);
        else {
          const a = porDia.get(l.vencimento) ?? [];
          a.push(l);
          porDia.set(l.vencimento, a);
        }
      }

    type Dia = { iso: string; itens: LinhaConta[]; total: number };
    type Semana = { inicio: string; fim: string; dias: Dia[]; total: number };
    const semanas = new Map<string, Semana>();
    for (const iso of [...porDia.keys()].sort()) {
      const itens = porDia.get(iso)!;
      const total = itens.reduce((s, l) => s + Number(l.valor), 0);
      const inicio = segundaDa(iso);
      const sem =
        semanas.get(inicio) ??
        { inicio, fim: addDias(inicio, 6), dias: [], total: 0 };
      sem.dias.push({ iso, itens, total });
      sem.total += total;
      semanas.set(inicio, sem);
    }

    return {
      vencidas,
      semVenc,
      semanas: [...semanas.values()],
      totalVencidas: vencidas.reduce((s, l) => s + Number(l.valor), 0),
      totalSemVenc: semVenc.reduce((s, l) => s + Number(l.valor), 0),
    };
  }, [filtradas, aberto, hojeBR]);

  const estaSemana = segundaDa(hojeBR);
  const rotuloSemana = (inicio: string) =>
    inicio === estaSemana
      ? "esta semana"
      : inicio === addDias(estaSemana, 7)
        ? "próxima semana"
        : null;
  const rotuloDia = (iso: string) =>
    iso === hojeBR ? "hoje" : iso === addDias(hojeBR, 1) ? "amanhã" : null;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 Buscar conta por descrição, fornecedor ou categoria..."
          className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        {busca && (
          <button
            onClick={() => setBusca("")}
            className="text-xs text-zinc-400 hover:text-orange-600"
          >
            limpar
          </button>
        )}
        <span className="ml-auto text-xs text-zinc-400">
          {filtradas.length} de {linhas.length}
        </span>
      </div>

      {filtradas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
          {busca ? (
            <>
              Nenhuma conta encontrada para <b>{busca}</b>.
            </>
          ) : (
            "Nenhuma conta com esses filtros."
          )}
        </div>
      ) : aberto ? (
        <div className="space-y-8">
          {grupos.vencidas.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-red-600">Vencidas</h2>
                <span className="text-sm font-medium text-red-600">
                  {moeda(grupos.totalVencidas)}
                </span>
              </div>
              <Linhas itens={grupos.vencidas} hojeBR={hojeBR} />
            </section>
          )}

          {grupos.semanas.map((sem) => {
            const rot = rotuloSemana(sem.inicio);
            return (
              <section key={sem.inicio}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-1.5 dark:border-zinc-800">
                  <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    Semana {curto(sem.inicio)} a {curto(sem.fim)}
                    {rot && (
                      <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                        {rot}
                      </span>
                    )}
                  </h2>
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                    {moeda(sem.total)}
                  </span>
                </div>
                <div className="space-y-4">
                  {sem.dias.map((d) => {
                    const rd = rotuloDia(d.iso);
                    return (
                      <div key={d.iso}>
                        <div className="mb-1 flex items-center justify-between">
                          <h3 className="text-xs font-medium text-zinc-500">
                            {DIAS[diaDaSemana(d.iso)]} {curto(d.iso)}
                            {rd && (
                              <span className="ml-1.5 font-semibold text-orange-600">
                                · {rd}
                              </span>
                            )}
                          </h3>
                          <span className="text-xs font-medium text-zinc-500">
                            {moeda(d.total)}
                          </span>
                        </div>
                        <Linhas itens={d.itens} hojeBR={hojeBR} />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {grupos.semVenc.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-400">Sem vencimento</h2>
                <span className="text-sm font-medium text-zinc-500">
                  {moeda(grupos.totalSemVenc)}
                </span>
              </div>
              <Linhas itens={grupos.semVenc} hojeBR={hojeBR} />
            </section>
          )}
        </div>
      ) : (
        <Linhas itens={filtradas} mostrarPago hojeBR={hojeBR} />
      )}
    </div>
  );
}
