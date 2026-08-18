"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarEtiqueta } from "./actions";
import { Combobox } from "@/components/combobox";

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function emDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

type Prod = {
  id: string;
  nome: string;
  validade_congelado: number | null;
  validade_resfriado: number | null;
  validade_ambiente: number | null;
};

export function EtiquetaForm({
  produtos,
  colaboradores,
}: {
  produtos: Prod[];
  colaboradores: { nome: string }[];
}) {
  const router = useRouter();
  const [gerando, start] = useTransition();
  const [produtoId, setProdutoId] = useState("");
  const [conservacao, setConservacao] = useState("resfriado");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [colaborador, setColaborador] = useState("");
  const [validade, setValidade] = useState("");

  function diasDe(p: Prod | undefined, cons: string) {
    if (!p) return null;
    return cons === "congelado"
      ? p.validade_congelado
      : cons === "ambiente"
        ? p.validade_ambiente
        : p.validade_resfriado;
  }

  function recalc(pid: string, cons: string) {
    const dias = diasDe(
      produtos.find((x) => x.id === pid),
      cons,
    );
    if (dias) setValidade(emDias(dias));
  }

  function gerar() {
    if (!produtoId) return;
    start(async () => {
      const r = await criarEtiqueta({
        produto_id: produtoId,
        colaborador_nome: colaborador,
        validade,
        conservacao,
        quantidade,
        unidade,
      });
      if (r?.ok && r.id) router.push(`/etiquetas/${r.id}`);
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="mb-4 font-semibold text-zinc-900 dark:text-zinc-50">
        Nova etiqueta
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-zinc-500">Produto</label>
          <Combobox
            options={produtos.map((p) => ({ value: p.id, label: p.nome }))}
            value={produtoId}
            onChange={(v) => {
              setProdutoId(v);
              recalc(v, conservacao);
            }}
            placeholder="Buscar produto..."
            className={input}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">Conservação</label>
          <select
            value={conservacao}
            onChange={(e) => {
              setConservacao(e.target.value);
              recalc(produtoId, e.target.value);
            }}
            className={input}
          >
            <option value="congelado">Congelado</option>
            <option value="resfriado">Resfriado</option>
            <option value="ambiente">Ambiente</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Quantidade</label>
            <input
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder="opcional"
              className={input}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Unidade</label>
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              className={input}
            >
              <option value="un">und</option>
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="L">L</option>
              <option value="ml">ml</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">
            Quem manipulou
          </label>
          <input
            list="colabs"
            value={colaborador}
            onChange={(e) => setColaborador(e.target.value)}
            placeholder="nome"
            className={input}
          />
          <datalist id="colabs">
            {colaboradores.map((c) => (
              <option key={c.nome} value={c.nome} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Validade</label>
          <input
            type="date"
            value={validade}
            onChange={(e) => setValidade(e.target.value)}
            className={input}
          />
        </div>
      </div>
      <button
        onClick={gerar}
        disabled={gerando || !produtoId}
        className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {gerando ? "Gerando..." : "Gerar etiqueta"}
      </button>
    </div>
  );
}
