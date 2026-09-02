"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarItemEtiqueta, excluirItemEtiqueta, salvarCategoriaEtiqueta } from "../actions";

export type CatRow = { id: string; nome: string; ordem: number; ativo: boolean };
export type ItemRow = {
  id: string;
  nome: string;
  categoria_id: string | null;
  validade_congelado: number | null;
  validade_resfriado: number | null;
  validade_ambiente: number | null;
  ativo: boolean;
};

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const num = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.floor(Number(s))) || null);
const str = (n: number | null) => (n == null ? "" : String(n));

export function ItensClient({ categorias, itens }: { categorias: CatRow[]; itens: ItemRow[] }) {
  const router = useRouter();
  const [salvando, start] = useTransition();
  const [filtro, setFiltro] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [novaCat, setNovaCat] = useState("");
  const [catEdit, setCatEdit] = useState<Record<string, { nome: string; ordem: string }>>({});
  const [novo, setNovo] = useState({ nome: "", categoria_id: "", resf: "", cong: "", amb: "" });
  const [edit, setEdit] = useState<Record<string, { nome: string; categoria_id: string; resf: string; cong: string; amb: string; ativo: boolean }>>({});

  const aviso = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };
  const edDe = (i: ItemRow) =>
    edit[i.id] ?? { nome: i.nome, categoria_id: i.categoria_id ?? "", resf: str(i.validade_resfriado), cong: str(i.validade_congelado), amb: str(i.validade_ambiente), ativo: i.ativo };
  const alterado = (i: ItemRow) => {
    const e = edit[i.id];
    if (!e) return false;
    return e.nome !== i.nome || e.categoria_id !== (i.categoria_id ?? "") || num(e.resf) !== i.validade_resfriado || num(e.cong) !== i.validade_congelado || num(e.amb) !== i.validade_ambiente || e.ativo !== i.ativo;
  };

  function salvar(i: ItemRow) {
    const e = edDe(i);
    start(async () => {
      await salvarItemEtiqueta({ id: i.id, nome: e.nome, categoria_id: e.categoria_id || null, validade_resfriado: num(e.resf), validade_congelado: num(e.cong), validade_ambiente: num(e.amb), ativo: e.ativo });
      setEdit((s) => { const c = { ...s }; delete c[i.id]; return c; });
      aviso("Salvo ✓");
      router.refresh();
    });
  }
  function criar() {
    if (!novo.nome.trim()) return;
    start(async () => {
      await salvarItemEtiqueta({ nome: novo.nome, categoria_id: novo.categoria_id || filtro || null, validade_resfriado: num(novo.resf), validade_congelado: num(novo.cong), validade_ambiente: num(novo.amb) });
      setNovo({ nome: "", categoria_id: "", resf: "", cong: "", amb: "" });
      aviso("Item criado ✓");
      router.refresh();
    });
  }
  function excluir(i: ItemRow) {
    if (!confirm(`Excluir "${i.nome}"? As etiquetas já impressas continuam no histórico.`)) return;
    start(async () => { await excluirItemEtiqueta(i.id); router.refresh(); });
  }
  function criarCat() {
    if (!novaCat.trim()) return;
    start(async () => {
      const r = await salvarCategoriaEtiqueta({ nome: novaCat, ordem: categorias.length + 1 });
      if (!r.ok) { aviso(r.mensagem || "Não foi possível."); return; }
      setNovaCat(""); aviso("Categoria criada ✓"); router.refresh();
    });
  }
  function salvarCat(c: CatRow) {
    const e = catEdit[c.id]; if (!e) return;
    start(async () => {
      const r = await salvarCategoriaEtiqueta({ id: c.id, nome: e.nome, ordem: Number(e.ordem) || 0, ativo: c.ativo });
      if (!r.ok) { aviso(r.mensagem || "Não foi possível."); return; }
      setCatEdit((s) => { const n = { ...s }; delete n[c.id]; return n; });
      aviso("Categoria salva ✓"); router.refresh();
    });
  }

  const q = busca.trim().toLowerCase();
  const lista = itens.filter((i) => (!filtro || i.categoria_id === filtro) && (!q || i.nome.toLowerCase().includes(q)));
  const nomeCat = (id: string | null) => categorias.find((c) => c.id === id)?.nome ?? "Sem categoria";

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">{msg}</div>}

      {/* Categorias */}
      <details className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <summary className="cursor-pointer font-semibold text-zinc-900 dark:text-zinc-50">Categorias ({categorias.length})</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {categorias.map((c) => {
            const e = catEdit[c.id] ?? { nome: c.nome, ordem: String(c.ordem) };
            const mudou = e.nome !== c.nome || Number(e.ordem) !== c.ordem;
            return (
              <div key={c.id} className="flex items-center gap-2">
                <input value={e.ordem} onChange={(ev) => setCatEdit((s) => ({ ...s, [c.id]: { ...e, ordem: ev.target.value } }))} className={`${input} w-14 text-center`} title="ordem" />
                <input value={e.nome} onChange={(ev) => setCatEdit((s) => ({ ...s, [c.id]: { ...e, nome: ev.target.value } }))} className={input} />
                <button onClick={() => salvarCat(c)} disabled={!mudou || salvando} className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Salvar</button>
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <input value={novaCat} onChange={(e) => setNovaCat(e.target.value)} placeholder="Nova categoria" className={input} />
            <button onClick={criarCat} disabled={!novaCat.trim() || salvando} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900">＋</button>
          </div>
        </div>
      </details>

      {/* Novo item */}
      <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 dark:border-orange-900 dark:bg-orange-950/10">
        <p className="mb-2 font-semibold text-zinc-900 dark:text-zinc-50">＋ Novo item</p>
        <div className="grid gap-2 sm:grid-cols-[2fr_1.5fr_repeat(3,minmax(0,1fr))_auto]">
          <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Nome (ex.: Base Feijão)" className={input} />
          <select value={novo.categoria_id || filtro} onChange={(e) => setNovo({ ...novo, categoria_id: e.target.value })} className={input}>
            <option value="">Sem categoria</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <input inputMode="numeric" value={novo.resf} onChange={(e) => setNovo({ ...novo, resf: e.target.value })} placeholder="Resfriado (dias)" className={input} />
          <input inputMode="numeric" value={novo.cong} onChange={(e) => setNovo({ ...novo, cong: e.target.value })} placeholder="Congelado (dias)" className={input} />
          <input inputMode="numeric" value={novo.amb} onChange={(e) => setNovo({ ...novo, amb: e.target.value })} placeholder="Ambiente (dias)" className={input} />
          <button onClick={criar} disabled={!novo.nome.trim() || salvando} className="rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">Criar</button>
        </div>
      </div>

      {/* Lista */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={`${input} w-auto`}>
          <option value="">Todas as categorias</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome} ({itens.filter((i) => i.categoria_id === c.id).length})</option>)}
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item..." className={`${input} w-56`} />
        <span className="text-sm text-zinc-500">{lista.length} item(ns)</span>
      </div>

      {lista.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">Nenhum item ainda. Cadastre acima.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Categoria</th>
                <th className="px-3 py-2 text-center">Resfriado</th>
                <th className="px-3 py-2 text-center">Congelado</th>
                <th className="px-3 py-2 text-center">Ambiente</th>
                <th className="px-3 py-2 text-center">Ativo</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {lista.map((i) => {
                const e = edDe(i);
                const set = (p: Partial<typeof e>) => setEdit((s) => ({ ...s, [i.id]: { ...e, ...p } }));
                return (
                  <tr key={i.id} className={`bg-white dark:bg-zinc-950 ${!i.ativo ? "opacity-50" : ""}`}>
                    <td className="px-3 py-1.5"><input value={e.nome} onChange={(ev) => set({ nome: ev.target.value })} className={input} /></td>
                    <td className="px-3 py-1.5">
                      <select value={e.categoria_id} onChange={(ev) => set({ categoria_id: ev.target.value })} className={input}>
                        <option value="">{nomeCat(null)}</option>
                        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5"><input inputMode="numeric" value={e.resf} onChange={(ev) => set({ resf: ev.target.value })} className={`${input} w-16 text-center`} /></td>
                    <td className="px-3 py-1.5"><input inputMode="numeric" value={e.cong} onChange={(ev) => set({ cong: ev.target.value })} className={`${input} w-16 text-center`} /></td>
                    <td className="px-3 py-1.5"><input inputMode="numeric" value={e.amb} onChange={(ev) => set({ amb: ev.target.value })} className={`${input} w-16 text-center`} /></td>
                    <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={e.ativo} onChange={(ev) => set({ ativo: ev.target.checked })} /></td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => salvar(i)} disabled={!alterado(i) || salvando} className="rounded-lg bg-orange-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-30">Salvar</button>
                      <button onClick={() => excluir(i)} disabled={salvando} className="ml-2 text-zinc-300 hover:text-red-600 dark:text-zinc-600" title="Excluir">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
