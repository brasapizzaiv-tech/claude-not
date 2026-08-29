"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  lancarRetirada, definirStatusRetirada, quitarColaborador, excluirRetirada, salvarProduto,
} from "./actions";

export type Pessoa = { id: string; nome: string };
export type Produto = { id: number; nome: string; categoria: string | null; preco: number; ativo: boolean };
export type Retirada = {
  id: number;
  colaborador_id: string | null;
  nome: string;
  produto_id: number | null;
  item: string;
  valor: number;
  peso: number | null;
  data: string;
  status: "aberto" | "pago";
  data_pagamento: string | null;
  observacao: string | null;
  obs_pagamento: string | null;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const fmtData = (s: string) => { const [a, m, d] = s.split("-"); return `${d}/${m}/${a}`; };
const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";

export function RetiradasClient({
  pessoas, produtos, retiradas, hojeIso,
}: {
  pessoas: Pessoa[];
  produtos: Produto[];
  retiradas: Retirada[];
  hojeIso: string;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [aba, setAba] = useState<"lancamentos" | "resumo" | "produtos">("resumo");
  const [aviso, setAviso] = useState<string | null>(null);
  const [ano, setAno] = useState(Number(hojeIso.slice(0, 4)));
  const [mes, setMes] = useState(Number(hojeIso.slice(5, 7)) - 1);
  const [novo, setNovo] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; mensagem?: string }>) {
    start(async () => {
      const r = await fn();
      if (r.ok) { setAviso(null); router.refresh(); }
      else setAviso(r.mensagem || "Não foi possível.");
    });
  }

  const mesTag = `${ano}-${String(mes + 1).padStart(2, "0")}`;
  function navega(delta: number) {
    let m = mes + delta, a = ano;
    if (m < 0) { m = 11; a--; } else if (m > 11) { m = 0; a++; }
    setMes(m); setAno(a);
  }

  const doMes = useMemo(
    () => retiradas.filter((r) => r.data.startsWith(mesTag)),
    [retiradas, mesTag],
  );

  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">🛒 Compras internas</h1>
        <button onClick={() => setNovo(true)} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">
          + Nova compra
        </button>
      </div>

      {aviso && <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">{aviso}</div>}

      <div className="mb-4 flex gap-2">
        {([["resumo", "Resumo"], ["lancamentos", "Lançamentos"], ["produtos", "Produtos e preços"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${aba === k ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "resumo" && <ResumoTab retiradas={retiradas} proc={proc} run={run} />}

      {aba === "lancamentos" && (
        <div className={card}>
          <div className="mb-2 flex items-center justify-between">
            <button onClick={() => navega(-1)} className="text-sm text-zinc-500">‹ Anterior</button>
            <h2 className="font-bold">{MESES[mes]} {ano}</h2>
            <button onClick={() => navega(1)} className="text-sm text-zinc-500">Próximo ›</button>
          </div>
          {doMes.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">Nenhuma compra nesse mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {doMes.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-2 whitespace-nowrap text-zinc-500">{fmtData(r.data)}</td>
                      <td className="py-2 pr-2">
                        <div className="font-medium">{r.nome}</div>
                        <div className="text-xs text-zinc-500">{r.item}{r.peso ? ` · ${r.peso} kg` : ""}{r.observacao ? ` · ${r.observacao}` : ""}</div>
                        {r.status === "pago" && (r.data_pagamento || r.obs_pagamento) && (
                          <div className="text-xs text-emerald-600">pago{r.data_pagamento ? ` ${fmtData(r.data_pagamento)}` : ""}{r.obs_pagamento ? ` · ${r.obs_pagamento}` : ""}</div>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap font-medium">{brl(Number(r.valor))}</td>
                      <td className="py-2 pr-2 whitespace-nowrap text-center">
                        <button
                          disabled={proc}
                          onClick={() => {
                            if (r.status === "pago") { run(() => definirStatusRetirada(r.id, false)); return; }
                            const obs = window.prompt("Observação do pagamento (opcional):", "");
                            if (obs === null) return;
                            run(() => definirStatusRetirada(r.id, true, obs));
                          }}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "pago" ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}
                          title="Clique para alternar"
                        >
                          {r.status === "pago" ? "Pago" : "Em aberto"}
                        </button>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          disabled={proc}
                          onClick={() => { if (window.confirm("Excluir este lançamento?")) run(() => excluirRetirada(r.id)); }}
                          className="text-xs text-zinc-400 hover:text-red-600"
                        >
                          excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 flex justify-between border-t border-zinc-200 pt-2 text-sm font-semibold dark:border-zinc-800">
                <span>Total do mês</span>
                <span>{brl(doMes.reduce((s, r) => s + Number(r.valor), 0))}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {aba === "produtos" && <ProdutosTab produtos={produtos} proc={proc} run={run} />}

      {novo && (
        <NovaCompra
          pessoas={pessoas}
          produtos={produtos.filter((p) => p.ativo)}
          hojeIso={hojeIso}
          proc={proc}
          onClose={() => setNovo(false)}
          onSalvar={(input) => { run(() => lancarRetirada(input)); setNovo(false); }}
        />
      )}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function NovaCompra({
  pessoas, produtos, hojeIso, proc, onClose, onSalvar,
}: {
  pessoas: Pessoa[];
  produtos: Produto[];
  hojeIso: string;
  proc: boolean;
  onClose: () => void;
  onSalvar: (input: { colaboradorId: string; produtoId: number | null; item: string; valor: number; peso: number | null; data: string; observacao: string }) => void;
}) {
  const [colaboradorId, setColab] = useState("");
  const [produtoId, setProdutoId] = useState<string>("");
  const [item, setItem] = useState("");
  const [valor, setValor] = useState("");
  const [peso, setPeso] = useState("");
  const [data, setData] = useState(hojeIso);
  const [obs, setObs] = useState("");

  function escolherProduto(idStr: string) {
    setProdutoId(idStr);
    const p = produtos.find((x) => String(x.id) === idStr);
    if (p) { setItem(p.nome); setValor(String(p.preco)); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold">Nova compra</h2>
        <div className="space-y-3">
          <select value={colaboradorId} onChange={(e) => setColab(e.target.value)} className={inputCls}>
            <option value="">Escolha a pessoa</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <select value={produtoId} onChange={(e) => escolherProduto(e.target.value)} className={inputCls}>
            <option value="">Produto do catálogo (opcional)</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} — {brl(p.preco)}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Item" className={inputCls} />
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="Valor (R$)" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
            <input value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" placeholder="Peso kg (opcional)" className={inputCls} />
          </div>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)" className={inputCls} />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">Cancelar</button>
            <button
              disabled={proc || !colaboradorId || !item.trim()}
              onClick={() => onSalvar({
                colaboradorId, produtoId: produtoId ? Number(produtoId) : null,
                item, valor: Number(String(valor).replace(",", ".")) || 0,
                peso: peso ? Number(String(peso).replace(",", ".")) : null, data, observacao: obs,
              })}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Lançar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResumoTab({ retiradas, proc, run }: {
  retiradas: Retirada[];
  proc: boolean;
  run: (fn: () => Promise<{ ok: boolean; mensagem?: string }>) => void;
}) {
  const porPessoa = useMemo(() => {
    const m = new Map<string, { nome: string; colaboradorId: string | null; comprado: number; pago: number; aberto: number }>();
    for (const r of retiradas) {
      const key = r.colaborador_id ?? `nome:${r.nome}`;
      const cur = m.get(key) ?? { nome: r.nome, colaboradorId: r.colaborador_id, comprado: 0, pago: 0, aberto: 0 };
      const v = Number(r.valor);
      cur.comprado += v;
      if (r.status === "pago") cur.pago += v; else cur.aberto += v;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.aberto - a.aberto || b.comprado - a.comprado);
  }, [retiradas]);
  const totais = porPessoa.reduce(
    (s, p) => ({ comprado: s.comprado + p.comprado, pago: s.pago + p.pago, aberto: s.aberto + p.aberto }),
    { comprado: 0, pago: 0, aberto: 0 },
  );

  const porMes = useMemo(() => {
    const m = new Map<string, { comprado: number; aberto: number }>();
    for (const r of retiradas) {
      const mm = r.data.slice(0, 7);
      const cur = m.get(mm) ?? { comprado: 0, aberto: 0 };
      cur.comprado += Number(r.valor);
      if (r.status === "aberto") cur.aberto += Number(r.valor);
      m.set(mm, cur);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [retiradas]);
  const mesLabel = (mm: string) => { const [a, m] = mm.split("-"); return `${MESES[Number(m) - 1]} ${a}`; };

  return (
    <div className="space-y-4">
      <div className={card}>
        <h2 className="mb-2 font-bold">Por funcionário</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-zinc-400">
              <tr>
                <th className="py-1 pr-2">Nome</th>
                <th className="py-1 pr-2 text-right">Comprado</th>
                <th className="py-1 pr-2 text-right">Pago</th>
                <th className="py-1 pr-2 text-right">Em aberto</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {porPessoa.map((p) => (
                <tr key={p.colaboradorId ?? p.nome}>
                  <td className="py-2 pr-2">{p.nome}</td>
                  <td className="py-2 pr-2 text-right">{brl(p.comprado)}</td>
                  <td className="py-2 pr-2 text-right text-emerald-600">{brl(p.pago)}</td>
                  <td className={`py-2 pr-2 text-right font-semibold ${p.aberto > 0 ? "text-red-500" : "text-zinc-400"}`}>{brl(p.aberto)}</td>
                  <td className="py-2 text-right">
                    {p.aberto > 0 && p.colaboradorId && (
                      <button
                        disabled={proc}
                        onClick={() => {
                          const obs = window.prompt(`Quitar tudo em aberto de ${p.nome} (${brl(p.aberto)}). Observação do pagamento (opcional):`, "");
                          if (obs === null) return;
                          run(() => quitarColaborador(p.colaboradorId!, obs));
                        }}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white"
                      >
                        Quitar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-200 font-bold dark:border-zinc-700">
                <td className="py-2 pr-2">Total</td>
                <td className="py-2 pr-2 text-right">{brl(totais.comprado)}</td>
                <td className="py-2 pr-2 text-right text-emerald-600">{brl(totais.pago)}</td>
                <td className="py-2 pr-2 text-right text-red-500">{brl(totais.aberto)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className={card}>
        <h2 className="mb-2 font-bold">Por mês</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-400">
            <tr>
              <th className="py-1 pr-2">Mês</th>
              <th className="py-1 pr-2 text-right">Comprado</th>
              <th className="py-1 pr-2 text-right">Em aberto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {porMes.length === 0 ? (
              <tr><td colSpan={3} className="py-3 text-center text-zinc-500">Sem lançamentos.</td></tr>
            ) : porMes.map(([mm, v]) => (
              <tr key={mm}>
                <td className="py-2 pr-2">{mesLabel(mm)}</td>
                <td className="py-2 pr-2 text-right">{brl(v.comprado)}</td>
                <td className={`py-2 pr-2 text-right ${v.aberto > 0 ? "text-red-500" : "text-zinc-400"}`}>{brl(v.aberto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProdutosTab({ produtos, proc, run }: {
  produtos: Produto[];
  proc: boolean;
  run: (fn: () => Promise<{ ok: boolean; mensagem?: string }>) => void;
}) {
  const [edit, setEdit] = useState<Produto | "novo" | null>(null);
  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">Produtos e preços</h2>
        <button onClick={() => setEdit("novo")} className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white">+ Produto</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {produtos.map((p) => (
              <tr key={p.id} className={p.ativo ? "" : "opacity-50"}>
                <td className="py-2 pr-2">
                  <div className="font-medium">{p.nome}</div>
                  <div className="text-xs text-zinc-500">{p.categoria ?? ""}{p.ativo ? "" : " · inativo"}</div>
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap font-medium">{brl(p.preco)}</td>
                <td className="py-2 text-right">
                  <button onClick={() => setEdit(p)} className="text-xs text-orange-600 hover:underline">editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <ProdutoModal alvo={edit} proc={proc} run={run} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ProdutoModal({ alvo, proc, run, onClose }: {
  alvo: Produto | "novo";
  proc: boolean;
  run: (fn: () => Promise<{ ok: boolean; mensagem?: string }>) => void;
  onClose: () => void;
}) {
  const novo = alvo === "novo";
  const p = novo ? null : (alvo as Produto);
  const [nome, setNome] = useState(p?.nome ?? "");
  const [categoria, setCategoria] = useState(p?.categoria ?? "");
  const [preco, setPreco] = useState(p ? String(p.preco) : "");
  const [ativo, setAtivo] = useState(p ? p.ativo : true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold">{novo ? "Novo produto" : "Editar produto"}</h2>
        <div className="space-y-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" className={inputCls} />
          <input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Categoria" className={inputCls} />
          <input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" placeholder="Preço (R$)" className={inputCls} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo</label>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">Cancelar</button>
            <button
              disabled={proc || !nome.trim()}
              onClick={() => { run(() => salvarProduto({ id: novo ? null : (p as Produto).id, nome, categoria, preco: Number(String(preco).replace(",", ".")) || 0, ativo })); onClose(); }}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
