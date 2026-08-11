"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { salvarConferencia } from "../actions";

export type ItemLinha = {
  id: string;
  nome: string;
  unidade: string;
  qtd: number;
  preco_unit: number | null;
  qtd_recebida: number | null;
  preco_recebido: number | null;
  obs: string | null;
};

type Estado = { qtd_recebida: string; preco_recebido: string; obs: string };

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numInput =
  "w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function ConferirClient({
  pedidoId,
  fornecedor,
  cotacao,
  data,
  status,
  observacoes,
  itens,
}: {
  pedidoId: string;
  fornecedor: string;
  cotacao: string;
  data: string;
  status: string;
  observacoes: string;
  itens: ItemLinha[];
}) {
  const router = useRouter();
  const [salvando, startSave] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [obsGeral, setObsGeral] = useState(observacoes);
  const [estado, setEstado] = useState<Record<string, Estado>>(() =>
    Object.fromEntries(
      itens.map((i) => [
        i.id,
        {
          qtd_recebida: String(i.qtd_recebida ?? i.qtd),
          preco_recebido: String(i.preco_recebido ?? i.preco_unit ?? ""),
          obs: i.obs ?? "",
        },
      ]),
    ),
  );

  const num = (s: string) => {
    const v = Number((s ?? "").replace(",", "."));
    return isNaN(v) ? 0 : v;
  };

  const totais = useMemo(() => {
    let pedido = 0;
    let recebido = 0;
    for (const i of itens) {
      pedido += (i.preco_unit ?? 0) * i.qtd;
      const e = estado[i.id];
      recebido += num(e.preco_recebido) * num(e.qtd_recebida);
    }
    return { pedido, recebido };
  }, [estado, itens]);

  function persistir(finalizar: boolean) {
    startSave(async () => {
      const payload = itens.map((i) => ({
        id: i.id,
        qtd_recebida: num(estado[i.id].qtd_recebida),
        preco_recebido: estado[i.id].preco_recebido
          ? num(estado[i.id].preco_recebido)
          : null,
        obs: estado[i.id].obs || null,
      }));
      await salvarConferencia(pedidoId, payload, obsGeral, finalizar);
      if (finalizar) {
        router.push("/conferencia");
      } else {
        setMsg("Conferência salva.");
        setTimeout(() => setMsg(null), 4000);
      }
    });
  }

  const conferido = status === "conferido";

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link
        href="/conferencia"
        className="text-sm text-zinc-500 hover:text-orange-600"
      >
        ← Voltar para conferência
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {fornecedor}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {cotacao ? `${cotacao} · ` : ""}
            {new Date(data).toLocaleDateString("pt-BR")} · {status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => persistir(false)}
            disabled={salvando}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Salvar
          </button>
          <button
            onClick={() => persistir(true)}
            disabled={salvando}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {conferido ? "Atualizar conferência" : "Confirmar conferência"}
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {msg}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-3">Produto</th>
              <th className="px-3 py-3 text-right">Pedido</th>
              <th className="px-3 py-3 text-right">Recebido</th>
              <th className="px-3 py-3 text-right">R$ cotado</th>
              <th className="px-3 py-3 text-right">R$ nota</th>
              <th className="px-3 py-3">Obs.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {itens.map((i) => {
              const e = estado[i.id];
              const divQtd = num(e.qtd_recebida) !== i.qtd;
              const divPreco =
                e.preco_recebido !== "" &&
                num(e.preco_recebido) !== (i.preco_unit ?? 0);
              const set = (campo: keyof Estado, v: string) =>
                setEstado((s) => ({ ...s, [i.id]: { ...s[i.id], [campo]: v } }));
              return (
                <tr key={i.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {i.nome}
                    <span className="ml-1 text-xs text-zinc-400">
                      {i.unidade}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500">{i.qtd}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      inputMode="decimal"
                      value={e.qtd_recebida}
                      onChange={(ev) => set("qtd_recebida", ev.target.value)}
                      className={`${numInput} ${
                        divQtd ? "border-amber-400 text-amber-600" : ""
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {i.preco_unit != null ? moeda(i.preco_unit) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      inputMode="decimal"
                      placeholder="—"
                      value={e.preco_recebido}
                      onChange={(ev) => set("preco_recebido", ev.target.value)}
                      className={`${numInput} ${
                        divPreco ? "border-amber-400 text-amber-600" : ""
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={e.obs}
                      onChange={(ev) => set("obs", ev.target.value)}
                      placeholder="ok / faltou / avariado"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900">
              <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">
                Totais
              </td>
              <td colSpan={2} className="px-3 py-3 text-right text-zinc-500">
                pedido {moeda(totais.pedido)}
              </td>
              <td colSpan={3} className="px-3 py-3 text-right text-zinc-900 dark:text-zinc-100">
                recebido {moeda(totais.recebido)}
                {totais.recebido !== totais.pedido && (
                  <span className="ml-2 text-amber-600">
                    (dif {moeda(totais.recebido - totais.pedido)})
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <label className="mt-4 block text-sm text-zinc-500">
        Observações gerais
        <textarea
          rows={2}
          value={obsGeral}
          onChange={(e) => setObsGeral(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>
    </div>
  );
}
