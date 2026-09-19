"use client";
import { Icone } from "@/components/icone";

import { useMemo, useState } from "react";
import Link from "next/link";
import { dataBR } from "@/lib/format";
import { NotaAcoes } from "./nota-acoes";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type NotaLinha = {
  id: string;
  numero: string | null;
  emit_nome: string | null;
  valor: number;
  data_emissao: string | null;
  vencimento: string | null;
  situacao: string;
  aguardando: boolean;
  parcelas: number;
};

const badge: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  lancada: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  cancelada: "bg-superficie-suave text-texto-fraco line-through",
};
const rotulo: Record<string, string> = {
  pendente: "pendente",
  lancada: "lançada",
  cancelada: "cancelada",
};

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function NotasLista({ notas }: { notas: NotaLinha[] }) {
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const q = norm(busca.trim());
    if (!q) return notas;
    return notas.filter(
      (n) =>
        norm(n.emit_nome ?? "").includes(q) ||
        (n.numero ?? "").toLowerCase().includes(q),
    );
  }, [busca, notas]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por fornecedor ou número da nota..."
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
          {filtradas.length} de {notas.length}
        </span>
      </div>

      {filtradas.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-10 text-center text-texto-suave">
          Nenhuma nota encontrada para <b>{busca}</b>.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs font-medium text-texto-fraco">
              <tr>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">Nº</th>
                <th className="px-4 py-3">Emissão</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {filtradas.map((n) => (
                <tr key={n.id}>
                  <td className="px-4 py-3 font-medium text-texto">
                    <Link href={`/notas/${n.id}`} className="hover:text-orange-600 hover:underline">
                      {n.emit_nome ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-texto-suave">{n.numero}</td>
                  <td className="px-4 py-3 text-texto-suave">
                    {n.data_emissao ? dataBR(n.data_emissao) : "—"}
                  </td>
                  <td className="px-4 py-3 text-texto-suave">
                    {n.vencimento ? dataBR(n.vencimento) : "—"}
                    {n.parcelas > 1 && (
                      <span
                        className="ml-1 rounded-controle bg-superficie-suave px-1.5 py-0.5 font-numero text-mini font-medium text-texto-suave"
                        title={`Nota parcelada em ${n.parcelas}x`}
                      >
                        {n.parcelas}x
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-numero font-medium tracking-apertada text-texto">
                    {moeda(Number(n.valor))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className={`rounded-controle px-2 py-0.5 text-xs font-medium ${
                          badge[n.situacao] ?? badge.pendente
                        }`}
                      >
                        {rotulo[n.situacao] ?? n.situacao}
                      </span>
                      {n.aguardando && (
                        <span
                          className="rounded-controle bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          title="Manifestada — a busca automática vai trazer os itens em alguns minutos."
                        >
                          <Icone nome="ampulheta" tamanho={12} className="mr-1" /> aguardando itens
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <NotaAcoes notaId={n.id} situacao={n.situacao} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
