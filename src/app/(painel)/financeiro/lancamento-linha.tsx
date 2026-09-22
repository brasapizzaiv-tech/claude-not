"use client";

import { useState, useTransition } from "react";
import { Combobox } from "@/components/combobox";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import { editarLancamento, excluirLancamento } from "./actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputCls =
  "rounded-controle border border-borda-forte bg-white px-2 py-1.5 text-sm text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100";

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
              <label className="mb-1 block text-mini text-texto-suave">Data</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
            </div>
            <div className="min-w-52 flex-1">
              <label className="mb-1 block text-mini text-texto-suave">Categoria</label>
              {/* Digitar filtra: são 117 categorias. O grupo entra no rótulo
                  pra achar tanto por "Salários" quanto por "Pessoal". */}
              <Combobox
                value={cat}
                onChange={setCat}
                placeholder="Escolha..."
                options={[...porGrupo.entries()].flatMap(([g, cs]) =>
                  cs.map((c) => ({ value: c.id, label: `${c.nome} — ${g}` })),
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-mini text-texto-suave">Valor</label>
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={`${inputCls} w-24 text-right`} />
            </div>
            <div className="min-w-40 flex-1">
              <label className="mb-1 block text-mini text-texto-suave">Descrição</label>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className="mb-1 block text-mini text-texto-suave">Vencimento</label>
              <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className={inputCls} />
            </div>
            <label className="flex items-center gap-1.5 pb-1.5 text-xs text-texto-suave">
              <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} /> Pago
            </label>
            <button onClick={salvar} disabled={proc} className="rounded-controle bg-texto px-4 py-1.5 text-sm font-medium text-fundo hover:opacity-90 disabled:opacity-60">
              {proc ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={() => setEditando(false)} className="px-2 py-1.5 text-sm text-texto-suave hover:text-texto-suave">
              Cancelar
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="">
      <td className="px-4 py-2 text-texto-suave">{dataBR(l.data)}</td>
      <td className="px-4 py-2 text-texto">{l.categoria_nome ?? "—"}</td>
      <td className="px-4 py-2 text-texto-suave">
        {l.descricao ?? l.fornecedor_nome ?? ""}
        {l.origem !== "manual" && (
          <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-mini text-orange-700 dark:bg-orange-950 dark:text-orange-300">
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
            <button onClick={() => setEditando(true)} className="text-texto-fraco hover:text-orange-600">
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
              className="ml-3 text-texto-fraco hover:text-red-600 disabled:opacity-60"
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
