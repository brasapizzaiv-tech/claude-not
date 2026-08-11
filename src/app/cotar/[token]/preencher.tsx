"use client";

import { useRef, useState, useTransition } from "react";
import { salvarPrecosPublico } from "./actions";

export type LinhaPreco = {
  produto_id: string;
  nome: string;
  unidade: string;
  marca: string | null;
  qtd: number;
  preco_unit: number | null;
  disponivel: boolean;
};

const numInput =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function CotarPreencher({
  token,
  descricao,
  fornecedor,
  prazo,
  fechada,
  produtos,
}: {
  token: string;
  descricao: string;
  fornecedor: string;
  prazo: string | null;
  fechada: boolean;
  produtos: LinhaPreco[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [enviando, startSend] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [indisp, setIndisp] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(produtos.map((p) => [p.produto_id, !p.disponivel])),
  );

  const ler = (name: string) => {
    const el = formRef.current?.elements.namedItem(name) as
      | HTMLInputElement
      | undefined;
    return (el?.value ?? "").replace(",", ".").trim();
  };

  function enviar() {
    startSend(async () => {
      const precos = produtos.map((p) => ({
        produto_id: p.produto_id,
        preco_unit: indisp[p.produto_id] ? "" : ler(`preco_${p.produto_id}`),
        disponivel: !indisp[p.produto_id],
      }));
      const r = await salvarPrecosPublico(token, precos);
      if (r?.ok) {
        setMsg(`Preços enviados! Obrigado. Você pode revisar e reenviar se quiser.`);
      } else {
        setMsg(r?.erro ?? "Não foi possível enviar. Tente de novo.");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setMsg(null), 6000);
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-24 dark:bg-zinc-950">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          {descricao}
        </h1>
        <p className="text-sm text-zinc-500">
          Cotação para <b>{fornecedor}</b>
          {prazo ? ` · prazo ${new Date(prazo).toLocaleDateString("pt-BR")}` : ""}
        </p>
      </div>

      <div className="mx-auto max-w-xl px-4">
        {msg && (
          <div className="mt-4 rounded-lg bg-green-100 px-4 py-3 text-sm font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
            {msg}
          </div>
        )}

        {fechada && (
          <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Esta cotação está fechada. Os preços não podem mais ser alterados.
          </div>
        )}

        <p className="mt-4 text-sm text-zinc-500">
          Informe o <b>preço por unidade</b> de cada item. Se não trabalhar com
          algum, marque <b>“Não tenho”</b>.
        </p>

        <form ref={formRef} className="mt-4 space-y-3">
          {produtos.map((p) => {
            const semEste = indisp[p.produto_id];
            return (
              <div
                key={p.produto_id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {p.nome}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {p.marca ? `${p.marca} · ` : ""}Qtd: {p.qtd} {p.unidade}
                    </p>
                  </div>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500">
                    <input
                      type="checkbox"
                      checked={semEste}
                      disabled={fechada}
                      onChange={(e) =>
                        setIndisp((s) => ({
                          ...s,
                          [p.produto_id]: e.target.checked,
                        }))
                      }
                    />
                    Não tenho
                  </label>
                </div>
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-400">R$</span>
                    <input
                      name={`preco_${p.produto_id}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={fechada || semEste}
                      defaultValue={p.preco_unit != null ? p.preco_unit : ""}
                      className={`${numInput} w-full ${
                        semEste ? "opacity-40" : ""
                      }`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </form>
      </div>

      {!fechada && (
        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-xl">
            <button
              onClick={enviar}
              disabled={enviando}
              className="w-full rounded-xl bg-orange-500 py-3 text-center font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {enviando ? "Enviando..." : "Enviar preços"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
