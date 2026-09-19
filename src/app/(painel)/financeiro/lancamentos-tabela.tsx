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
          placeholder="Buscar por descrição, categoria ou fornecedor..."
          className="w-full max-w-md min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
        />
        {busca && (
          <button
            onClick={() => setBusca("")}
            className="text-xs text-texto-fraco hover:text-orange-600"
          >
            limpar
          </button>
        )}
        <span className="ml-auto text-xs text-texto-fraco">
          {filtradas.length} de {lancamentos.length}
        </span>
      </div>

      {filtradas.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-10 text-center text-texto-suave">
          Nenhum lançamento encontrado para <b>{busca}</b>.
        </div>
      ) : (
        <div className="overflow-hidden rounded-cartao bg-painel-cartao">
          <div className="overflow-x-auto">
            <table className="min-w-[560px] w-full text-sm">
              <thead className="text-left text-xs font-medium text-texto-fraco">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {filtradas.map((l) => (
                  <LancamentoLinha key={l.id} l={l} categorias={categorias} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
