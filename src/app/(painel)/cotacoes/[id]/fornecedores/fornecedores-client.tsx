"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { convidarFornecedor, removerFornecedor } from "../../actions";

export type FornecedorLinha = {
  id: string;
  nome: string;
  whatsapp: string | null;
  cobertura: number;
  convidado: boolean;
  token: string | null;
  respondido: boolean;
};

export function FornecedoresClient({
  cotacaoId,
  totalItens,
  linhas,
}: {
  cotacaoId: string;
  totalItens: number;
  linhas: FornecedorLinha[];
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  useMemo(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  async function convidar(fornecedorId: string) {
    await convidarFornecedor(cotacaoId, fornecedorId);
    router.refresh();
  }
  async function remover(fornecedorId: string) {
    await removerFornecedor(cotacaoId, fornecedorId);
    router.refresh();
  }

  const convidados = linhas.filter((l) => l.convidado);

  return (
    <div className="mt-6 space-y-8">
      {/* Fornecedores disponíveis */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3 text-right">Fornece</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {linhas.map((l) => (
              <tr key={l.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  {l.nome}
                </td>
                <td className="px-4 py-2 text-right text-zinc-500">
                  {l.cobertura} de {totalItens}
                </td>
                <td className="px-4 py-2 text-right">
                  {l.convidado ? (
                    <button
                      onClick={() => remover(l.id)}
                      className="text-xs text-zinc-400 hover:text-red-600"
                    >
                      Remover
                    </button>
                  ) : (
                    <button
                      onClick={() => convidar(l.id)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Convidar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Links para os fornecedores convidados */}
      {convidados.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Links para enviar
          </h2>
          <div className="space-y-3">
            {convidados.map((l) => {
              const url = l.token ? `${origin}/cotar/${l.token}` : "";
              const zap = (l.whatsapp ?? "").replace(/\D/g, "");
              const msg = encodeURIComponent(
                `Olá! Segue o link para você nos passar os preços da cotação (${l.cobertura} itens). ${url}`,
              );
              const waHref = zap
                ? `https://wa.me/55${zap}?text=${msg}`
                : `https://wa.me/?text=${msg}`;

              return (
                <div
                  key={l.id}
                  className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {l.nome}
                    </span>
                    {l.respondido ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                        Respondeu
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        Aguardando
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      readOnly
                      value={url}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(url)}
                      className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Copiar
                    </button>
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
