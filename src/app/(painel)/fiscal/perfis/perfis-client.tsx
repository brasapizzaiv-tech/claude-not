"use client";
import { Icone } from "@/components/icone";
import { confirmar } from "@/components/dialogo";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarPerfilFiscal, excluirPerfilFiscal, definirPerfilCategoria, definirPerfilItem } from "../actions";

export type Perfil = { id: string; nome: string; ncm: string | null; cest: string | null; cfop: string; csosn: string; origem: string; unidade: string; pis_cst: string; cofins_cst: string; homologado: boolean; obs: string | null; ativo: boolean; is_cst: string | null; is_classificacao: string | null; is_aliquota: number | null; ibs_cbs_cst: string | null; ibs_cbs_classificacao: string | null; ibs_uf_aliquota: number | null; ibs_mun_aliquota: number | null; cbs_aliquota: number | null };
export type Categoria = { id: string; nome: string; perfil_fiscal_id: string | null };
export type ItemCard = { id: string; nome: string; categoria: string | null; perfil_fiscal_id: string | null };

const inputCls =
  "rounded-controle border border-borda-forte bg-white px-2 py-1.5 text-sm text-texto outline-none focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100";

const VAZIO: Omit<Perfil, "id" | "ativo"> = { nome: "", ncm: "", cest: "", cfop: "5102", csosn: "102", origem: "0", unidade: "UN", pis_cst: "49", cofins_cst: "49", homologado: false, obs: "", is_cst: "", is_classificacao: "", is_aliquota: null, ibs_cbs_cst: "", ibs_cbs_classificacao: "", ibs_uf_aliquota: null, ibs_mun_aliquota: null, cbs_aliquota: null };

export function PerfisClient({ perfis, categorias, itens, padrao }: { perfis: Perfil[]; categorias: Categoria[]; itens: ItemCard[]; padrao: { ncm: string; cfop: string; csosn: string } }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [editando, setEditando] = useState<(Omit<Perfil, "id" | "ativo"> & { id?: string }) | null>(null);
  const [busca, setBusca] = useState("");
  const [soExcecoes, setSoExcecoes] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const perfilDe = useMemo(() => new Map(perfis.map((p) => [p.id, p])), [perfis]);
  const catPorNome = useMemo(() => new Map(categorias.map((c) => [c.nome, c])), [categorias]);
  const contagemCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of itens) m.set(i.categoria ?? "", (m.get(i.categoria ?? "") ?? 0) + 1);
    return m;
  }, [itens]);

  // Perfil que vale pro item: o dele, senão o da categoria, senão o padrão da config.
  function efetivo(i: ItemCard) {
    if (i.perfil_fiscal_id) return { perfil: perfilDe.get(i.perfil_fiscal_id) ?? null, fonte: "item" as const };
    const c = i.categoria ? catPorNome.get(i.categoria) : null;
    if (c?.perfil_fiscal_id) return { perfil: perfilDe.get(c.perfil_fiscal_id) ?? null, fonte: "categoria" as const };
    return { perfil: null, fonte: "padrao" as const };
  }

  const itensFiltrados = itens
    .filter((i) => !busca || i.nome.toLowerCase().includes(busca.toLowerCase()) || (i.categoria ?? "").toLowerCase().includes(busca.toLowerCase()))
    .filter((i) => !soExcecoes || !!i.perfil_fiscal_id)
    .sort((a, b) => (a.categoria ?? "").localeCompare(b.categoria ?? "") || a.nome.localeCompare(b.nome));

  const semPerfil = itens.filter((i) => efetivo(i).fonte === "padrao").length;

  function run(fn: () => Promise<{ ok: boolean; mensagem?: string } | void>, okMsg?: string) {
    setMsg(null);
    start(async () => {
      try {
        const r = await fn();
        if (r && !r.ok) setMsg(r.mensagem || "Não deu certo.");
        else if (okMsg) setMsg(okMsg);
        router.refresh();
      } catch {
        setMsg("Sem conexão. Tente de novo.");
      }
    });
  }

  return (
    <div className="space-y-8">
      {msg && <p className="rounded-controle bg-superficie-suave px-3 py-2 text-sm">{msg}</p>}

      {/* 1. Perfis */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">1. Perfis fiscais</h2>
          <button onClick={() => setEditando({ ...VAZIO })} className="rounded-controle bg-orange-500 px-3 py-1.5 text-sm font-medium text-white">+ Novo perfil</button>
        </div>
        <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs font-medium text-texto-fraco">
              <tr>
                <th className="px-3 py-2">Perfil</th>
                <th className="px-3 py-2">NCM</th>
                <th className="px-3 py-2">CEST</th>
                <th className="px-3 py-2">CFOP</th>
                <th className="px-3 py-2">CSOSN</th>
                <th className="px-3 py-2">Orig.</th>
                <th className="px-3 py-2">Un.</th>
                <th className="px-3 py-2">Homol.</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {perfis.map((p) => (
                <tr key={p.id} className={`bg-painel-cartao ${!p.ativo ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.nome}</div>
                    {p.obs && <div className="text-mini text-texto-fraco">{p.obs}</div>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p.ncm || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.cest || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.cfop}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.csosn}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.origem}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.unidade}</td>
                  <td className="px-3 py-2 text-xs">{p.homologado ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">✓ contador</span> : <span className="text-amber-600">pendente</span>}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => setEditando({ id: p.id, nome: p.nome, ncm: p.ncm ?? "", cest: p.cest ?? "", cfop: p.cfop, csosn: p.csosn, origem: p.origem, unidade: p.unidade, pis_cst: p.pis_cst, cofins_cst: p.cofins_cst, homologado: p.homologado, obs: p.obs ?? "", is_cst: p.is_cst, is_classificacao: p.is_classificacao, is_aliquota: p.is_aliquota, ibs_cbs_cst: p.ibs_cbs_cst, ibs_cbs_classificacao: p.ibs_cbs_classificacao, ibs_uf_aliquota: p.ibs_uf_aliquota, ibs_mun_aliquota: p.ibs_mun_aliquota, cbs_aliquota: p.cbs_aliquota })} className="mr-3 text-orange-600 hover:underline">Editar</button>
                    <button
                      onClick={async () => { if (await confirmar(`Excluir o perfil "${p.nome}"? Categorias e itens que usam ele voltam pro padrão.`)) run(() => excluirPerfilFiscal(p.id)); }}
                      className="text-texto-fraco hover:text-red-600"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-texto-suave">
          <b>Padrão da Config fiscal</b> (quando nada se aplica, e pro buffet): NCM {padrao.ncm || "—"} · CFOP {padrao.cfop || "—"} · CSOSN {padrao.csosn || "—"}.
          Os 12 perfis iniciais vieram do Suitable, já homologados pelo contador. Perfil novo ou alterado fica como &quot;pendente&quot; até você marcar que o contador conferiu.
        </p>
      </section>

      {/* 2. Por categoria */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">2. Perfil por categoria do cardápio</h2>
        <p className="mb-2 text-sm text-texto-suave">Escolha o perfil de cada categoria: todos os itens dela passam a usar esse perfil (a não ser que o item tenha exceção abaixo).</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {categorias.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-cartao border border-borda px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.nome}</div>
                <div className="text-mini text-texto-fraco">{contagemCat.get(c.nome) ?? 0} itens</div>
              </div>
              <select
                value={c.perfil_fiscal_id ?? ""}
                disabled={pend}
                onChange={(e) => run(() => definirPerfilCategoria(c.id, e.target.value || null))}
                className={`${inputCls} w-44`}
              >
                <option value="">— padrão da config —</option>
                {perfis.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          ))}
        </div>
        {semPerfil > 0 && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400"><Icone nome="alerta" tamanho={13} className="mr-1" /> {semPerfil} {semPerfil === 1 ? "item ainda cai" : "itens ainda caem"} no padrão da config (categoria sem perfil).</p>
        )}
      </section>

      {/* 3. Exceções por item */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">3. Exceções por item</h2>
        <p className="mb-2 text-sm text-texto-suave">Só se um item precisar de perfil diferente da categoria (ex.: uma água dentro de &quot;Bebidas&quot;). Em branco = herda da categoria.</p>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item ou categoria…" className={`${inputCls} w-64`} />
          <label className="flex items-center gap-1.5 text-sm text-texto-suave">
            <input type="checkbox" checked={soExcecoes} onChange={(e) => setSoExcecoes(e.target.checked)} /> só com exceção
          </label>
        </div>
        <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs font-medium text-texto-fraco">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Categoria</th>
                <th className="px-3 py-2">Perfil em uso</th>
                <th className="px-3 py-2">Exceção</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {itensFiltrados.map((i) => {
                const ef = efetivo(i);
                return (
                  <tr key={i.id} className="">
                    <td className="px-3 py-1.5">{i.nome}</td>
                    <td className="px-3 py-1.5 text-texto-suave">{i.categoria ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      {ef.perfil ? (
                        <span className={ef.fonte === "item" ? "font-medium text-orange-600" : ""}>{ef.perfil.nome}</span>
                      ) : (
                        <span className="text-amber-600">padrão da config</span>
                      )}
                      <span className="ml-1 text-mini text-texto-fraco">({ef.fonte === "item" ? "exceção" : ef.fonte === "categoria" ? "categoria" : "config"})</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={i.perfil_fiscal_id ?? ""}
                        disabled={pend}
                        onChange={(e) => run(() => definirPerfilItem(i.id, e.target.value || null))}
                        className={`${inputCls} w-44`}
                      >
                        <option value="">— herda da categoria —</option>
                        {perfis.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal do perfil */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => salvarPerfilFiscal(fd), "Perfil salvo.");
              setEditando(null);
            }}
            className="w-full max-w-lg space-y-3 rounded-cartao bg-painel-cartao p-5"
          >
            <h3 className="text-lg font-semibold">{editando.id ? "Editar perfil" : "Novo perfil fiscal"}</h3>
            {editando.id && <input type="hidden" name="id" value={editando.id} />}
            <div>
              <label className="mb-1 block text-xs text-texto-suave">Nome do perfil *</label>
              <input name="nome" required defaultValue={editando.nome} placeholder="Ex.: Cerveja (ST)" className={`${inputCls} w-full`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-texto-suave">NCM (8 dígitos)</label>
                <input name="ncm" defaultValue={editando.ncm ?? ""} placeholder="21069090" inputMode="numeric" className={`${inputCls} w-full font-mono`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-texto-suave">CEST (se tiver ST)</label>
                <input name="cest" defaultValue={editando.cest ?? ""} placeholder="03.021.00" className={`${inputCls} w-full font-mono`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-texto-suave">CFOP *</label>
                <input name="cfop" required defaultValue={editando.cfop} placeholder="5102 ou 5405" inputMode="numeric" className={`${inputCls} w-full font-mono`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-texto-suave">CSOSN *</label>
                <select name="csosn" defaultValue={editando.csosn} className={`${inputCls} w-full`}>
                  <option value="102">102 — sem crédito (Simples)</option>
                  <option value="103">103 — isenção por faixa</option>
                  <option value="300">300 — imune</option>
                  <option value="400">400 — não tributada</option>
                  <option value="500">500 — ICMS já recolhido (ST)</option>
                  <option value="900">900 — outros</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-texto-suave">Origem</label>
                <select name="origem" defaultValue={editando.origem} className={`${inputCls} w-full`}>
                  <option value="0">0 — Nacional</option>
                  <option value="1">1 — Estrangeira (importação direta)</option>
                  <option value="2">2 — Estrangeira (mercado interno)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-texto-suave">Unidade</label>
                <select name="unidade" defaultValue={editando.unidade} className={`${inputCls} w-full`}>
                  <option value="UN">UN</option>
                  <option value="KG">KG</option>
                  <option value="LT">LT</option>
                  <option value="PC">PC</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-texto-suave">CST do PIS</label>
                <select name="pis_cst" defaultValue={editando.pis_cst} className={`${inputCls} w-full`}>
                  <option value="49">49 — outras operações de saída</option>
                  <option value="07">07 — isenta</option>
                  <option value="08">08 — sem incidência</option>
                  <option value="99">99 — outras</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-texto-suave">CST do COFINS</label>
                <select name="cofins_cst" defaultValue={editando.cofins_cst} className={`${inputCls} w-full`}>
                  <option value="49">49 — outras operações de saída</option>
                  <option value="07">07 — isenta</option>
                  <option value="08">08 — sem incidência</option>
                  <option value="99">99 — outras</option>
                </select>
              </div>
            </div>
            <details className="rounded-controle border border-borda p-2">
              <summary className="cursor-pointer text-xs font-semibold text-texto-suave">Reforma tributária (IS, IBS/CBS) — informativo em 2026</summary>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div><label className="mb-1 block text-mini text-texto-suave">CST do IS</label><input name="is_cst" defaultValue={editando.is_cst ?? ""} placeholder="000" className={`${inputCls} w-full font-mono`} /></div>
                <div><label className="mb-1 block text-mini text-texto-suave">Alíquota IS (%)</label><input name="is_aliquota" defaultValue={editando.is_aliquota ?? ""} inputMode="decimal" className={`${inputCls} w-full`} /></div>
                <div><label className="mb-1 block text-mini text-texto-suave">Classif. trib. IS</label><input name="is_classificacao" defaultValue={editando.is_classificacao ?? ""} placeholder="000001" className={`${inputCls} w-full font-mono`} /></div>
                <div><label className="mb-1 block text-mini text-texto-suave">CST IBS/CBS</label><input name="ibs_cbs_cst" defaultValue={editando.ibs_cbs_cst ?? ""} placeholder="000" className={`${inputCls} w-full font-mono`} /></div>
                <div className="col-span-2"><label className="mb-1 block text-mini text-texto-suave">Classif. trib. IBS/CBS</label><input name="ibs_cbs_classificacao" defaultValue={editando.ibs_cbs_classificacao ?? ""} placeholder="000001" className={`${inputCls} w-full font-mono`} /></div>
                <div><label className="mb-1 block text-mini text-texto-suave">IBS estadual (%)</label><input name="ibs_uf_aliquota" defaultValue={editando.ibs_uf_aliquota ?? ""} inputMode="decimal" className={`${inputCls} w-full`} /></div>
                <div><label className="mb-1 block text-mini text-texto-suave">IBS municipal (%)</label><input name="ibs_mun_aliquota" defaultValue={editando.ibs_mun_aliquota ?? ""} inputMode="decimal" className={`${inputCls} w-full`} /></div>
                <div><label className="mb-1 block text-mini text-texto-suave">CBS (%)</label><input name="cbs_aliquota" defaultValue={editando.cbs_aliquota ?? ""} inputMode="decimal" className={`${inputCls} w-full`} /></div>
              </div>
            </details>
            <div>
              <label className="mb-1 block text-xs text-texto-suave">Observação</label>
              <input name="obs" defaultValue={editando.obs ?? ""} className={`${inputCls} w-full`} />
            </div>
            <label className="flex items-start gap-2 rounded-controle bg-amber-50 p-2 text-sm dark:bg-amber-950/30">
              <input type="checkbox" name="homologado" defaultChecked={editando.homologado} className="mt-0.5 h-4 w-4" />
              <span><b>Perfil homologado pelo contador.</b> Marque só depois que o responsável fiscal conferiu — perfil errado gera multa e imposto a mais.</span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditando(null)} className="rounded-controle px-4 py-2 text-sm text-texto-suave">Cancelar</button>
              <button type="submit" disabled={pend} className="rounded-controle bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
