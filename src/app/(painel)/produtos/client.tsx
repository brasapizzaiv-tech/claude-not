"use client";
import { Icone } from "@/components/icone";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Produto, Categoria } from "@/lib/types";
import { Combobox } from "@/components/combobox";
import {
  salvarProduto,
  excluirProduto,
  definirFornecedoresDoProduto,
  vincularProdutosAoFornecedor,
  vincularSemFornecedorNaFeira,
  marcarExclusivo,
  marcarExclusivosEmLote,
  salvarIdealFardo,
} from "./actions";

// Campo numérico editável na própria lista: salva ao sair do campo ou no Enter,
// mostra ✓ rapidinho. Tab pula pro próximo produto (ordem natural da tabela).
function CampoInline({ id, campo, valor, placeholder }: { id: string; campo: "estoque_ideal" | "fardo"; valor: number; placeholder?: string }) {
  const [txt, setTxt] = useState(valor > 0 ? String(valor).replace(".", ",") : "");
  const [estado, setEstado] = useState<"" | "salvando" | "ok" | "erro">("");
  async function salvar() {
    const n = Number(txt.replace(",", ".")) || 0;
    if (n === valor || (n === 0 && !(valor > 0))) { setTxt(n > 0 ? String(n).replace(".", ",") : ""); return; }
    setEstado("salvando");
    const r = await salvarIdealFardo(id, campo, n);
    setEstado(r.ok ? "ok" : "erro");
    setTimeout(() => setEstado(""), 1500);
  }
  return (
    <span className="relative inline-block">
      <input
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onFocus={(e) => e.target.select()}
        inputMode="decimal"
        placeholder={placeholder ?? "—"}
        className={`w-16 rounded-controle border bg-transparent px-2 py-1 text-right text-sm outline-none focus:border-orange-500 ${estado === "erro" ? "border-red-500" : estado === "ok" ? "border-emerald-500" : "border-borda dark:border-borda-forte"}`}
      />
      {estado === "ok" && <span className="absolute -right-4 top-1 text-xs text-emerald-500">✓</span>}
      {estado === "salvando" && <span className="absolute -right-4 top-1 text-xs text-texto-fraco">…</span>}
    </span>
  );
}

type Fornecedor = { id: string; nome: string };

const inputCls =
  "w-full rounded-controle border border-borda-forte bg-white px-3 py-2 text-sm text-texto outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100";

const UNIDADES = [
  "un", "kg", "g", "L", "ml", "cx", "pct", "fardo", "dz", "saco", "bandeja",
];

const moeda = (v: number | null) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ProdutosClient({
  produtos,
  categorias,
  categoriaInicial = "",
  fornecedores,
  vinculos,
}: {
  produtos: Produto[];
  categorias: Categoria[];
  categoriaInicial?: string;
  fornecedores: Fornecedor[];
  vinculos: { produto_id: string; fornecedor_id: string }[];
}) {
  const [editando, setEditando] = useState<Produto | null>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState(categoriaInicial);

  // Vínculos produto -> fornecedores (editável na tela).
  const [vinc, setVinc] = useState<Map<string, Set<string>>>(() => {
    const m = new Map<string, Set<string>>();
    for (const v of vinculos) {
      if (!m.has(v.produto_id)) m.set(v.produto_id, new Set());
      m.get(v.produto_id)!.add(v.fornecedor_id);
    }
    return m;
  });
  const [fornDe, setFornDe] = useState<Produto | null>(null);
  const [forcarExc, setForcarExc] = useState(false); // abrir modal já forçando exclusivo
  const semForn = produtos.filter((p) => !(vinc.get(p.id)?.size)).length;

  // Produtos marcados como exclusivos (editável na lista).
  const [exclusivos, setExclusivos] = useState<Set<string>>(
    () => new Set(produtos.filter((p) => p.exclusivo).map((p) => p.id)),
  );

  function alternarExclusivoLista(prod: Produto, marcar: boolean) {
    if (marcar && (vinc.get(prod.id)?.size ?? 0) > 1) {
      // Mais de um fornecedor: força escolher qual fica (abre o painel).
      setForcarExc(true);
      setFornDe(prod);
      return;
    }
    setExclusivos((s) => {
      const n = new Set(s);
      if (marcar) n.add(prod.id);
      else n.delete(prod.id);
      return n;
    });
    start(async () => {
      const r = await marcarExclusivo(prod.id, marcar);
      // Servidor viu 2+ fornecedores: reverte e abre pra escolher qual fica.
      if (marcar && !r.ok && "precisaEscolher" in r) {
        setExclusivos((s) => {
          const n = new Set(s);
          n.delete(prod.id);
          return n;
        });
        setForcarExc(true);
        setFornDe(prod);
      }
    });
  }


  const router = useRouter();
  const [proc, start] = useTransition();
  // Seleção múltipla para vincular vários produtos a um fornecedor de uma vez.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkForn, setBulkForn] = useState("");
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  function toggleSel(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      const okBusca = !b || p.nome.toLowerCase().includes(b);
      const okCat = !categoria || p.categorias?.nome === categoria;
      return okBusca && okCat;
    });
  }, [produtos, busca, categoria]);

  function marcarTodosExclusivos() {
    const ids = filtrados.map((p) => p.id);
    if (ids.length === 0) return;
    start(async () => {
      const r = await marcarExclusivosEmLote(ids);
      setExclusivos((s) => {
        const n = new Set(s);
        for (const id of r.marcados) n.add(id);
        return n;
      });
      setBulkMsg(
        `✓ ${r.marcados.length} produto(s) marcado(s) como exclusivo(s).` +
          (r.pulados > 0 ? ` (${r.pulados} com 2+ fornecedores — marque um a um pra escolher qual fica)` : ""),
      );
    });
  }

  const todosSelecionados =
    filtrados.length > 0 && filtrados.every((p) => sel.has(p.id));
  function toggleTodos() {
    setSel((s) => {
      const n = new Set(s);
      if (todosSelecionados) filtrados.forEach((p) => n.delete(p.id));
      else filtrados.forEach((p) => n.add(p.id));
      return n;
    });
  }
  function vincularSelecionados() {
    if (!bulkForn || sel.size === 0) return;
    const ids = [...sel];
    setBulkMsg(null);
    start(async () => {
      const r = await vincularProdutosAoFornecedor(ids, bulkForn);
      // Atualiza o mapa local de vínculos.
      setVinc((m) => {
        const n = new Map(m);
        for (const id of ids) {
          const set = new Set(n.get(id) ?? []);
          set.add(bulkForn);
          n.set(id, set);
        }
        return n;
      });
      const nome = fornecedores.find((f) => f.id === bulkForn)?.nome ?? "fornecedor";
      const pulados = (r as { pulados?: number }).pulados ?? 0;
      setBulkMsg(
        `✓ ${r.total} produto(s) vinculado(s) a ${nome}.` +
          (pulados > 0 ? ` (${pulados} exclusivo(s) pulado(s))` : ""),
      );
      setSel(new Set());
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
            Produtos
          </h1>
          <p className="mt-1 text-texto-suave">
            {filtrados.length} de {produtos.length}
          </p>
        </div>
        <button
          onClick={() => {
            setEditando(null);
            setAberto(true);
          }}
          className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90"
        >
          + Adicionar
        </button>
      </div>

      {semForn > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-controle bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <span>
            {semForn} produto(s) sem nenhum fornecedor — não aparecem pra ninguém na cotação.
          </span>
          <FeiraBotao />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          placeholder="Buscar produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className={`${inputCls} max-w-xs`}
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className={`${inputCls} max-w-xs`}
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.nome}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      {sel.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-cartao border border-orange-300 bg-orange-50 px-4 py-3 dark:border-orange-800 dark:bg-orange-950/20">
          <span className="text-sm font-medium text-texto-suave">
            {sel.size} produto(s) selecionado(s)
          </span>
          <div className="min-w-56 flex-1">
            <Combobox
              options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
              value={bulkForn}
              onChange={setBulkForn}
              placeholder="Escolher fornecedor..."
              className={`${inputCls}`}
            />
          </div>
          <button
            onClick={vincularSelecionados}
            disabled={proc || !bulkForn}
            className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90 disabled:opacity-60"
          >
            {proc ? "Vinculando..." : "Vincular ao fornecedor"}
          </button>
          <button
            onClick={() => setSel(new Set())}
            className="text-xs text-texto-suave hover:text-texto-suave"
          >
            limpar
          </button>
        </div>
      )}
      {bulkMsg && (
        <p className="mb-3 text-sm text-green-700 dark:text-green-400">{bulkMsg}</p>
      )}

      {filtrados.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          Nenhum produto encontrado.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-texto-fraco">
              <tr>
                <th className="w-8 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    onChange={toggleTodos}
                    title="Selecionar todos os filtrados"
                  />
                </th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Un.</th>
                <th className="px-4 py-3 text-right" title="Estoque ideal — edite direto aqui (Enter ou Tab salva)">Ideal</th>
                <th className="px-4 py-3 text-right" title="Unidades por fardo — edite direto aqui">Fardo</th>
                <th className="px-4 py-3">Fornecedores</th>
                <th className="px-4 py-3 text-center whitespace-nowrap" title="Exclusivo (1 fornecedor)">
                  <Icone nome="cadeado" tamanho={12} className="mr-1" /> Excl.
                  <button
                    type="button"
                    onClick={marcarTodosExclusivos}
                    className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-mini font-medium normal-case text-orange-700 hover:bg-orange-200 dark:bg-orange-500/15 dark:text-orange-300"
                    title="Marcar todos os produtos filtrados como exclusivos (os que têm 1 fornecedor)"
                  >
                    todos
                  </button>
                </th>
                <th className="px-4 py-3">Preço ref.</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {filtrados.map((p) => (
                <tr
                  key={p.id}
                  className={`hover:bg-superficie-suave ${
                    sel.has(p.id)
                      ? "bg-orange-50/50 dark:bg-orange-950/10"
                      : "bg-painel-cartao "
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={sel.has(p.id)}
                      onChange={() => toggleSel(p.id)}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-texto">
                    {p.nome}
                    {p.marca && (
                      <span className="block text-xs font-normal text-texto-fraco">
                        {p.marca}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-texto-suave">
                    {p.categorias?.nome ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-texto-suave">
                    {p.unidade}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <CampoInline key={`i-${p.id}-${p.estoque_ideal}`} id={p.id} campo="estoque_ideal" valor={Number(p.estoque_ideal) || 0} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <CampoInline key={`f-${p.id}-${p.fardo}`} id={p.id} campo="fardo" valor={Number(p.fardo) || 0} />
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const n = vinc.get(p.id)?.size ?? 0;
                      return (
                        <button
                          onClick={() => setFornDe(p)}
                          className={`rounded-controle px-2 py-1 text-xs font-medium ${
                            n === 0
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                              : "bg-superficie-suave text-texto-suave hover:bg-zinc-200  "
                          }`}
                        >
                          {n === 0 ? "sem fornecedor" : `${n} fornecedor${n > 1 ? "es" : ""}`}
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={exclusivos.has(p.id)}
                      onChange={(e) => alternarExclusivoLista(p, e.target.checked)}
                      title="Fornecedor exclusivo (só 1 — vai só pra ele na cotação)"
                      className="h-4 w-4 accent-orange-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-texto-suave">
                    {moeda(p.preco_referencia)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEditando(p);
                        setAberto(true);
                      }}
                      className="mr-3 text-orange-600 hover:underline"
                    >
                      Editar
                    </button>
                    <form action={excluirProduto} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        className="text-texto-fraco hover:text-red-600"
                      >
                        Remover
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-cartao bg-painel-cartao p-6">
            <h2 className="mb-4 text-lg font-semibold text-texto">
              {editando ? "Editar produto" : "Novo produto"}
            </h2>
            <form
              action={async (fd) => {
                await salvarProduto(fd);
                setAberto(false);
              }}
              className="space-y-3"
            >
              {editando && (
                <input type="hidden" name="id" value={editando.id} />
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-texto-suave">
                  Nome *
                </label>
                <input
                  name="nome"
                  required
                  defaultValue={editando?.nome ?? ""}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-texto-suave">
                  Categoria
                </label>
                <select
                  name="categoria_id"
                  defaultValue={editando?.categoria_id ?? ""}
                  className={inputCls}
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-texto-suave">
                    Unidade
                  </label>
                  <select
                    name="unidade"
                    defaultValue={editando?.unidade ?? "un"}
                    className={inputCls}
                  >
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-texto-suave">
                    Estoque ideal
                  </label>
                  <input
                    name="estoque_ideal"
                    inputMode="decimal"
                    defaultValue={editando?.estoque_ideal ?? 0}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-texto-suave">
                    Fardo (und por fardo)
                  </label>
                  <input
                    name="fardo"
                    inputMode="numeric"
                    defaultValue={editando?.fardo ? editando.fardo : ""}
                    placeholder="ex.: 12 — vazio = por unidade"
                    className={inputCls}
                  />
                </div>
              </div>
              <p className="-mt-1 text-xs text-texto-fraco">
                Estoque ideal = quanto você quer ter sempre. Na cotação, a
                sugestão de compra será: ideal − o que foi contado, arredondado
                pra <b>fechar fardos inteiros</b> (se o fardo estiver preenchido).
              </p>
              <input
                type="hidden"
                name="estoque_minimo"
                defaultValue={editando?.estoque_minimo ?? 0}
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-texto-suave">
                  Validade após manipulação (dias)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <input
                      name="validade_congelado"
                      inputMode="numeric"
                      placeholder="—"
                      defaultValue={editando?.validade_congelado ?? ""}
                      className={inputCls}
                    />
                    <p className="mt-1 text-center text-xs text-texto-fraco">Congelado</p>
                  </div>
                  <div>
                    <input
                      name="validade_resfriado"
                      inputMode="numeric"
                      placeholder="—"
                      defaultValue={editando?.validade_resfriado ?? ""}
                      className={inputCls}
                    />
                    <p className="mt-1 text-center text-xs text-texto-fraco">Resfriado</p>
                  </div>
                  <div>
                    <input
                      name="validade_ambiente"
                      inputMode="numeric"
                      placeholder="—"
                      defaultValue={editando?.validade_ambiente ?? ""}
                      className={inputCls}
                    />
                    <p className="mt-1 text-center text-xs text-texto-fraco">Ambiente</p>
                  </div>
                </div>
                <p className="mt-1 text-xs text-texto-fraco">
                  Dias de validade por conservação (usado nas etiquetas).
                </p>
              </div>
              <div className="rounded-cartao border border-violet-200 p-3 dark:border-violet-900">
                <label className="flex items-center gap-2 text-sm font-medium text-texto-suave">
                  <input
                    type="checkbox"
                    name="tem_st"
                    defaultChecked={editando?.tem_st ?? false}
                  />
                  Este produto tem ICMS-ST
                </label>
                <div className="mt-2">
                  <label className="mb-1 block text-xs text-texto-suave">
                    % de ST padrão (opcional) — já vem preenchida pro fornecedor
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      name="st_pct_padrao"
                      inputMode="decimal"
                      placeholder="Ex.: 17"
                      defaultValue={editando?.st_pct_padrao ?? ""}
                      className={`${inputCls} w-28`}
                    />
                    <span className="text-sm text-texto-fraco">%</span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-texto-fraco">
                  Marcado: na cotação aparece um campo pro fornecedor dizer se a ST
                  já está no preço e qual a %. O custo já sai correto.
                </p>
              </div>

              {/* Dados fiscais (NF-e / NFC-e) */}
              <details className="rounded-cartao border border-borda p-3">
                <summary className="cursor-pointer text-sm font-medium text-texto-suave">
                  Dados fiscais (NF-e / NFC-e) — o contador informa
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-texto-suave">NCM</label>
                    <input name="ncm" defaultValue={editando?.ncm ?? ""} placeholder="Ex.: 21069090" className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-texto-suave">CFOP</label>
                    <input name="cfop" defaultValue={editando?.cfop ?? ""} placeholder="Ex.: 5102" className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-texto-suave">CSOSN</label>
                    <input name="csosn" defaultValue={editando?.csosn ?? ""} placeholder="Ex.: 102" className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-texto-suave">CEST (se ST)</label>
                    <input name="cest" defaultValue={editando?.cest ?? ""} placeholder="—" className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-texto-suave">Origem</label>
                    <input name="origem" defaultValue={editando?.origem ?? "0"} placeholder="0" className={inputCls} />
                  </div>
                </div>
                <p className="mt-2 text-mini text-texto-fraco">
                  Usado na emissão da nota fiscal. Deixe em branco por enquanto se ainda
                  não tiver com o contador — dá pra preencher depois.
                </p>
              </details>
              <div>
                <label className="mb-1 block text-sm font-medium text-texto-suave">
                  Observações
                </label>
                <textarea
                  name="observacoes"
                  rows={2}
                  defaultValue={editando?.observacoes ?? ""}
                  className={inputCls}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="rounded-controle px-4 py-2 text-sm text-texto-suave hover:bg-superficie-suave dark:text-texto-fraco"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {fornDe && (
        <FornecedoresModal
          produto={fornDe}
          fornecedores={fornecedores}
          selecionados={vinc.get(fornDe.id) ?? new Set()}
          forcarExclusivo={forcarExc}
          onFechar={() => {
            setFornDe(null);
            setForcarExc(false);
          }}
          onSalvo={(ids, exclusivo) => {
            const pid = fornDe.id;
            setVinc((m) => {
              const n = new Map(m);
              n.set(pid, new Set(ids));
              return n;
            });
            setExclusivos((s) => {
              const n = new Set(s);
              if (exclusivo) n.add(pid);
              else n.delete(pid);
              return n;
            });
            setFornDe(null);
            setForcarExc(false);
          }}
        />
      )}
    </div>
  );
}

function FeiraBotao() {
  const [p, start] = useTransition();
  const [feito, setFeito] = useState<number | null>(null);
  return (
    <button
      onClick={() =>
        start(async () => {
          const r = await vincularSemFornecedorNaFeira();
          setFeito(r?.total ?? 0);
          setTimeout(() => window.location.reload(), 800);
        })
      }
      disabled={p}
      className="shrink-0 rounded-controle bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
    >
      {p
        ? "Vinculando..."
        : feito != null
          ? `✓ ${feito} vinculado(s) à Feira`
          : "Jogar todos na Hortifrúti / Feira"}
    </button>
  );
}

function FornecedoresModal({
  produto,
  fornecedores,
  selecionados,
  forcarExclusivo,
  onFechar,
  onSalvo,
}: {
  produto: Produto;
  fornecedores: Fornecedor[];
  selecionados: Set<string>;
  forcarExclusivo?: boolean;
  onFechar: () => void;
  onSalvo: (ids: string[], exclusivo: boolean) => void;
}) {
  // Se abriu forçando exclusivo com vários fornecedores, começa sem nenhum
  // marcado — obriga a escolher qual fornecedor fica.
  const [sel, setSel] = useState<Set<string>>(
    () => new Set(forcarExclusivo && selecionados.size > 1 ? [] : selecionados),
  );
  const [exclusivo, setExclusivo] = useState(forcarExclusivo || produto.exclusivo);
  const [busca, setBusca] = useState("");
  const [p, start] = useTransition();

  const filtrados = fornecedores.filter(
    (f) => !busca.trim() || f.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  function toggle(id: string) {
    setSel((s) => {
      if (exclusivo) {
        // Exclusivo = só 1 fornecedor: clicar troca a seleção (ou desmarca).
        return s.has(id) ? new Set() : new Set([id]);
      }
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function alternarExclusivo(v: boolean) {
    setExclusivo(v);
    // Ao ligar exclusivo, mantém no máximo 1 fornecedor marcado.
    if (v && sel.size > 1) setSel(new Set([[...sel][0]]));
  }

  function salvar() {
    start(async () => {
      const ids = exclusivo ? [...sel].slice(0, 1) : [...sel];
      await definirFornecedoresDoProduto(produto.id, ids, exclusivo);
      onSalvo(ids, exclusivo);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-cartao bg-painel-cartao">
        <div className="border-b border-borda p-4">
          <p className="text-xs text-texto-fraco">Fornecedores de</p>
          <p className="text-lg font-semibold text-texto">{produto.nome}</p>
          <label className="mt-3 flex items-center gap-2 rounded-controle border border-borda px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={exclusivo}
              onChange={(e) => alternarExclusivo(e.target.checked)}
            />
            <span className="text-texto-suave">
              <Icone nome="cadeado" tamanho={14} className="mr-1.5" /> Fornecedor exclusivo <span className="text-texto-fraco">(só 1 — vai só pra ele na cotação)</span>
            </span>
          </label>
          <input
            placeholder="Buscar fornecedor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={`${inputCls} mt-3`}
          />
          <p className="mt-1 text-xs text-texto-fraco">
            {sel.size} marcado(s){exclusivo ? " · exclusivo: escolha 1 fornecedor" : ""}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtrados.map((f) => {
            const on = sel.has(f.id);
            return (
              <button
                key={f.id}
                onClick={() => toggle(f.id)}
                className={`flex w-full items-center gap-2 rounded-controle px-3 py-2 text-left text-sm ${
                  on
                    ? "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                    : "text-texto-suave hover:bg-superficie-suave  "
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded border text-mini ${on ? "border-orange-500 bg-orange-500 text-white" : "border-borda-forte"}`}>
                  {on ? "✓" : ""}
                </span>
                {f.nome}
              </button>
            );
          })}
          {filtrados.length === 0 && (
            <p className="p-4 text-center text-sm text-texto-fraco">Nenhum fornecedor.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-borda p-4">
          <button
            onClick={onFechar}
            className="rounded-controle px-4 py-2 text-sm text-texto-suave hover:bg-superficie-suave dark:text-texto-fraco"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={p}
            className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90 disabled:opacity-60"
          >
            {p ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
