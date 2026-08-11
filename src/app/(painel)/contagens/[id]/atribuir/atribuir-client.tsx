"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Contagem, Colaborador } from "@/lib/types";
import { salvarAtribuicao } from "../../actions";

export type CategoriaLinha = {
  id: string;
  nome: string;
  qtdProdutos: number;
  colaboradorId: string | null;
};

export function AtribuirClient({
  contagem,
  categorias,
  colaboradores,
  links,
}: {
  contagem: Contagem;
  categorias: CategoriaLinha[];
  colaboradores: Colaborador[];
  links: Record<string, string>;
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  useMemo(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const nomeColab = (id: string | null) =>
    colaboradores.find((c) => c.id === id)?.nome ?? null;

  async function atribuir(categoriaId: string, colaboradorId: string) {
    await salvarAtribuicao(contagem.id, categoriaId, colaboradorId || null);
    router.refresh();
  }

  // Agrupa categorias por colaborador (para montar os links).
  const porColaborador = useMemo(() => {
    const m = new Map<string, CategoriaLinha[]>();
    for (const c of categorias) {
      if (!c.colaboradorId) continue;
      const arr = m.get(c.colaboradorId) ?? [];
      arr.push(c);
      m.set(c.colaboradorId, arr);
    }
    return m;
  }, [categorias]);

  const semAtribuir = categorias.filter((c) => !c.colaboradorId).length;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link
        href={`/contagens/${contagem.id}`}
        className="text-sm text-zinc-500 hover:text-orange-600"
      >
        ← Voltar para a contagem
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Dividir contagem por categoria
      </h1>
      <p className="mt-1 text-zinc-500">
        Atribua cada categoria a um colaborador e envie o link para ele
        preencher pelo celular.
      </p>

      {colaboradores.length === 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Você ainda não tem colaboradores.{" "}
          <Link href="/colaboradores" className="font-medium underline">
            Cadastre um colaborador
          </Link>{" "}
          primeiro.
        </div>
      )}

      {/* Atribuição por categoria */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Produtos</th>
              <th className="px-4 py-3">Responsável</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {categorias.map((c) => (
              <tr key={c.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  {c.nome}
                </td>
                <td className="px-4 py-2 text-zinc-500">{c.qtdProdutos}</td>
                <td className="px-4 py-2">
                  <select
                    value={c.colaboradorId ?? ""}
                    onChange={(e) => atribuir(c.id, e.target.value)}
                    disabled={colaboradores.length === 0}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">— ninguém —</option>
                    {colaboradores.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.nome}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {semAtribuir > 0 && (
        <p className="mt-2 text-xs text-zinc-400">
          {semAtribuir} categoria(s) ainda sem responsável.
        </p>
      )}

      {/* Links por colaborador */}
      {porColaborador.size > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Links para enviar
          </h2>
          <div className="space-y-3">
            {[...porColaborador.entries()].map(([colabId, cats]) => {
              const colab = colaboradores.find((c) => c.id === colabId);
              const token = links[colabId];
              const url = token ? `${origin}/contar/${token}` : "";
              const zap = (colab?.whatsapp ?? "").replace(/\D/g, "");
              const msg = encodeURIComponent(
                `Olá ${colab?.nome ?? ""}! Segue o link para você fazer a contagem de estoque das categorias: ${cats
                  .map((c) => c.nome)
                  .join(", ")}. ${url}`,
              );
              const waHref = zap
                ? `https://wa.me/55${zap}?text=${msg}`
                : `https://wa.me/?text=${msg}`;

              return (
                <div
                  key={colabId}
                  className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {colab?.nome}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {cats.length} categoria(s):{" "}
                      {cats.map((c) => c.nome).join(", ")}
                    </span>
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
