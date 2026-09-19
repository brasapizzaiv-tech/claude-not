"use client";

import { useEffect, useMemo, useState } from "react";
import { confirmar } from "@/components/dialogo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Contagem, Colaborador } from "@/lib/types";
import { salvarAtribuicao, atribuirTudo } from "../../actions";

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
  // Origem do link só existe no navegador (SSR não tem window).
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(t);
  }, []);

  const [todosPara, setTodosPara] = useState("");

  async function atribuir(categoriaId: string, colaboradorId: string) {
    await salvarAtribuicao(contagem.id, categoriaId, colaboradorId || null);
    router.refresh();
  }

  async function darTudo() {
    if (!todosPara) return;
    if (
      !await confirmar(
        "Isso vai atribuir a contagem INTEIRA a esse colaborador (ele conta tudo). Continuar?",
      )
    )
      return;
    await atribuirTudo(contagem.id, todosPara);
    setTodosPara("");
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
        className="text-sm text-texto-suave hover:text-orange-600"
      >
        ← Voltar para a contagem
      </Link>

      <h1 className="mt-2 font-numero text-2xl font-semibold tracking-apertada text-texto">
        Dividir contagem por categoria
      </h1>
      <p className="mt-1 text-texto-suave">
        Atribua cada categoria a um colaborador e envie o link para ele
        preencher pelo celular.
      </p>

      {colaboradores.length === 0 && (
        <div className="mt-4 rounded-controle bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Você ainda não tem colaboradores.{" "}
          <Link href="/colaboradores" className="font-medium underline">
            Cadastre um colaborador
          </Link>{" "}
          primeiro.
        </div>
      )}

      {/* Atalho: contagem inteira para um colaborador */}
      {colaboradores.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-cartao border border-borda bg-superficie-suave p-4">
          <span className="text-sm font-medium text-texto-suave">
            Dar a contagem inteira a um colaborador:
          </span>
          <select
            value={todosPara}
            onChange={(e) => setTodosPara(e.target.value)}
            className="rounded-controle border border-borda-forte bg-white px-2 py-1.5 text-sm text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950"
          >
            <option value="">escolha...</option>
            {colaboradores.map((col) => (
              <option key={col.id} value={col.id}>
                {col.nome}
              </option>
            ))}
          </select>
          <button
            onClick={darTudo}
            disabled={!todosPara}
            className="rounded-controle bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
          >
            Atribuir tudo
          </button>
        </div>
      )}

      {/* Atribuição por categoria */}
      <div className="mt-6 overflow-hidden rounded-cartao bg-painel-cartao">
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-medium text-texto-fraco">
            <tr>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Produtos</th>
              <th className="px-4 py-3">Responsável</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {categorias.map((c) => (
              <tr key={c.id} className="">
                <td className="px-4 py-2 font-medium text-texto">
                  {c.nome}
                </td>
                <td className="px-4 py-2 text-texto-suave">{c.qtdProdutos}</td>
                <td className="px-4 py-2">
                  <select
                    value={c.colaboradorId ?? ""}
                    onChange={(e) => atribuir(c.id, e.target.value)}
                    disabled={colaboradores.length === 0}
                    className="rounded-controle border border-borda-forte bg-white px-2 py-1 text-sm text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950"
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
        <p className="mt-2 text-xs text-texto-fraco">
          {semAtribuir} categoria(s) ainda sem responsável.
        </p>
      )}

      {/* Links por colaborador */}
      {porColaborador.size > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-texto">
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
                ? `https://web.whatsapp.com/send?phone=55${zap}&text=${msg}`
                : `https://web.whatsapp.com/`;

              return (
                <div
                  key={colabId}
                  className="rounded-cartao border border-borda p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium text-texto">
                      {colab?.nome}
                    </span>
                    <span className="text-xs text-texto-fraco">
                      {cats.length} categoria(s):{" "}
                      {cats.map((c) => c.nome).join(", ")}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      readOnly
                      value={url}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-controle border border-borda-forte bg-superficie-suave px-3 py-2 text-sm text-texto-suave dark:text-texto-fraco"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(url)}
                      className="rounded-controle border border-borda-forte px-3 py-2 text-sm font-medium text-texto-suave hover:bg-superficie-suave dark:border-borda-forte"
                    >
                      Copiar
                    </button>
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-controle bg-texto px-3 py-2 text-sm font-medium text-fundo hover:opacity-90"
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
