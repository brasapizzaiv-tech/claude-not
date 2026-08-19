"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import { editarLancamento, excluirLancamento } from "./actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export type LancRow = {
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
type Cat = { id: string; nome: string; grupo: string };

export function LancamentoLinha({ l, categorias }: { l: LancRow; categorias: Cat[] }) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [editando, setEditando] = useState(false);
  const [data, setData] = useState(l.data);
  const [cat, setCat] = useState(l.categoria_id ?? "");
  const [valor, setValor] = useState(String(l.valor).replace(".", ","));
  const [desc, setDesc] = useState(l.descricao ?? "");
  const [venc, setVenc] = useState(l.vencimento ?? "");
  const [pago, setPago] = useState(!!l.pago);

  const receita = l.tipo === "receita";
  const manual = l.origem === "manual";

  const porGrupo = new Map<string, Cat[]>();
  for (const c of categorias) {
    const a = porGrupo.get(c.grupo) ?? [];
    a.push(c);
    porGrupo.set(c.grupo, a);
  }

  function salvar() {
    const v = Number(valor.replace(/\./g, "").replace(",", ".")) || 0;
    start(async () => {
      await editarLancamento(l.id, {
        data,
        categoria_id: cat,
        valor: v,
        descricao: desc,
        vencimento: venc || null,
        pago,
      });
      setEditando(false);
      router.refresh();
    });
  }

  if (editando) {
    return (
      <tr className="bg-orange-50/40 dark:bg-orange-950/10">
        <td colSpan={5} className="px-4 py-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-zinc-500">Data</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
            </div>
            <div className="min-w-52 flex-1">
              <label className="mb-1 block text-[11px] text-zinc-500">Categoria</label>
              <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${inputCls} w-full`}>
                <option value="">Escolha...</option>
                {[...porGrupo.entries()].map(([g, cs]) => (
                  <optgroup key={g} label={g}>
                    {cs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-zinc-500">Valor</label>
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={`${inputCls} w-24 text-right`} />
            </div>
            <div className="min-w-40 flex-1">
              <label className="mb-1 block text-[11px] text-zinc-500">Descrição</label>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-zinc-500">Vencimento</label>
              <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className={inputCls} />
            </div>
            <label className="flex items-center gap-1.5 pb-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} /> Pago
            </label>
            <button onClick={salvar} disabled={proc} className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">
              {proc ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={() => setEditando(false)} className="px-2 py-1.5 text-sm text-zinc-500 hover:text-zinc-700">
              Cancelar
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-white dark:bg-zinc-950">
      <td className="px-4 py-2 text-zinc-500">{dataBR(l.data)}</td>
      <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">{l.categoria_nome ?? "—"}</td>
      <td className="px-4 py-2 text-zinc-500">
        {l.descricao ?? l.fornecedor_nome ?? ""}
        {l.origem !== "manual" && (
          <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700 dark:bg-orange-950 dark:text-orange-300">
            {l.origem === "caixa" ? "caixa" : "auto"}
          </span>
        )}
      </td>
      <td className={`px-4 py-2 text-right font-medium ${receita ? "text-green-600" : "text-red-600"}`}>
        {receita ? "" : "- "}
        {moeda(Number(l.valor))}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right">
        {manual ? (
          <>
            <button onClick={() => setEditando(true)} className="text-zinc-400 hover:text-orange-600">
              Editar
            </button>
            <button
              onClick={() =>
                start(async () => {
                  const fd = new FormData();
                  fd.set("id", l.id);
                  await excluirLancamento(fd);
                  router.refresh();
                })
              }
              disabled={proc}
              className="ml-3 text-zinc-400 hover:text-red-600 disabled:opacity-60"
            >
              Remover
            </button>
          </>
        ) : (
          <span className="text-xs text-zinc-300 dark:text-zinc-600">automático</span>
        )}
      </td>
    </tr>
  );
}
