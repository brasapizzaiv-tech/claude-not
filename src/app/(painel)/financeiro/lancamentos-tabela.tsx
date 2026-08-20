"use client";

import { useMemo, useState } from "react";
import { LancamentoLinha } from "./lancamento-linha";

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

type Linha = {
  id: string;
  data: string;
  descricao: string | null;
  valor: number;
  origem: string;
  categoria_id: string | null;
  tipo: string | null;
  categoria_nome: string | null;
  fornecedor_nome: string | null;
  vencimento: string | null;
  pago: boolean;
};

export function LancamentosTabela({
  lancamentos,
  categorias,
}: {
  lancamentos: Linha[];
  categorias: { id: string; nome: string; grupo: string }[];
}) {
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const q = norm(busca.trim());
    if (!q) return lancamentos;
    return lancamentos.filter(
      (l) =>
        norm(l.descricao ?? "").includes(q) ||
        norm(l.categoria_nome ?? "").includes(q) ||
        norm(l.fornecedor_nome ?? "").includes(q),
    );
  }, [busca, lancamentos]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 Buscar por descrição, categoria ou fornecedor..."
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
          {filtradas.length} de {lancamentos.length}
        </span>
      </div>

      {filtradas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum lançamento encontrado para <b>{busca}</b>.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtradas.map((l) => (
                <LancamentoLinha key={l.id} l={l} categorias={categorias} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
