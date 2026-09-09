"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarSolicitacaoPainel, excluirSolicitacao, responderSolicitacao, responderVarias } from "./actions";

export type Solic = {
  id: number;
  colaborador_id: string | null;
  nome: string;
  tipo: "compra" | "manutencao";
  item: string;
  quantidade: string | null;
  motivo: string | null;
  urgente: boolean;
  status: "pendente" | "comprado" | "rejeitado";
  resposta: string | null;
  respondido_em: string | null;
  criado_em: string;
};
export type Pessoa = { id: string; nome: string };

type Aba = "pendente" | "comprado" | "rejeitado" | "todas";

const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const fData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });
const diasAtras = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const BADGE: Record<Solic["status"], string> = {
  pendente: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  comprado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  rejeitado: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};
const ROTULO: Record<Solic["status"], string> = { pendente: "Pendente", comprado: "Comprado", rejeitado: "Rejeitado" };
const rotulo = (s: Solic) => (s.status === "comprado" && s.tipo === "manutencao" ? "Feito" : ROTULO[s.status]);
type Tipo = "" | "compra" | "manutencao";

export function SolicitacoesClient({ lista, pessoas }: { lista: Solic[]; pessoas: Pessoa[] }) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("pendente");
  const [busca, setBusca] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [tipo, setTipo] = useState<Tipo>("");
  const [soUrgentes, setSoUrgentes] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [novo, setNovo] = useState(false);
  const [proc, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const contagem = useMemo(() => {
    const c = { pendente: 0, comprado: 0, rejeitado: 0 };
    for (const s of lista) c[s.status]++;
    return c;
  }, [lista]);

  const q = norm(busca.trim());
  const filtradas = useMemo(
    () =>
      lista.filter((s) => {
        if (aba !== "todas" && s.status !== aba) return false;
        if (pessoa && s.colaborador_id !== pessoa) return false;
        if (tipo && s.tipo !== tipo) return false;
        if (soUrgentes && !s.urgente) return false;
        if (q && !norm(`${s.item} ${s.quantidade ?? ""} ${s.motivo ?? ""} ${s.nome}`).includes(q)) return false;
        return true;
      }),
    [lista, aba, pessoa, tipo, soUrgentes, q],
  );

  function rodar(fn: () => Promise<{ ok: boolean; mensagem?: string }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg(r.mensagem ?? "Erro.");
      else setMarcadas(new Set());
      router.refresh();
    });
  }
  function comprado(s: Solic) {
    rodar(() => responderSolicitacao(s.id, "comprado"));
  }
  function rejeitar(s: Solic) {
    const motivo = prompt(`${s.tipo === "manutencao" ? "Não vai fazer" : "Rejeitar"} "${s.item}". Quer deixar um recado pra ${s.nome.split(" ")[0]}? (opcional)`);
    if (motivo === null) return;
    rodar(() => responderSolicitacao(s.id, "rejeitado", motivo));
  }
  function recado(s: Solic) {
    const texto = prompt("Recado pra pessoa (aparece no app dela):", s.resposta ?? "");
    if (texto === null) return;
    rodar(() => responderSolicitacao(s.id, s.status, texto));
  }
  function reabrir(s: Solic) {
    rodar(() => responderSolicitacao(s.id, "pendente"));
  }
  function excluir(s: Solic) {
    if (!confirm(`Apagar o pedido "${s.item}"?`)) return;
    rodar(() => excluirSolicitacao(s.id));
  }
  function loteComprado() {
    rodar(() => responderVarias([...marcadas], "comprado"));
  }
  function loteRejeitar() {
    const motivo = prompt("Rejeitar os selecionados. Recado (opcional):");
    if (motivo === null) return;
    rodar(() => responderVarias([...marcadas], "rejeitado", motivo));
  }
  function alternar(id: number) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const pendentesVisiveis = filtradas.filter((s) => s.status === "pendente");
  const abas: { k: Aba; rotulo: string; n?: number }[] = [
    { k: "pendente", rotulo: "Pendentes", n: contagem.pendente },
    { k: "comprado", rotulo: "Compradas / feitas", n: contagem.comprado },
    { k: "rejeitado", rotulo: "Rejeitadas", n: contagem.rejeitado },
    { k: "todas", rotulo: "Todas" },
  ];
  const inp = "rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">🛠️ Pedidos da equipe</h1>
          <p className="text-sm text-zinc-500">Compras pra repor e manutenções que o pessoal pediu pelo app. Marque comprado/feito ou rejeite.</p>
        </div>
        <button onClick={() => setNovo((v) => !v)} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900">
          {novo ? "Fechar" : "+ Anotar pedido"}
        </button>
      </div>

      {novo && <NovoPedido pessoas={pessoas} onFeito={() => { setNovo(false); router.refresh(); }} />}

      <div className="mb-3 flex flex-wrap gap-2">
        {abas.map((a) => (
          <button
            key={a.k}
            onClick={() => { setAba(a.k); setMarcadas(new Set()); }}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${aba === a.k ? "bg-orange-500 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"}`}
          >
            {a.rotulo}{a.n != null ? ` (${a.n})` : ""}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className={`${inp} w-64`} placeholder="Buscar item, motivo, pessoa…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className={inp} value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
          <option value="">Compras e manutenções</option>
          <option value="compra">🛒 Só compras</option>
          <option value="manutencao">🔧 Só manutenções</option>
        </select>
        <select className={inp} value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
          <option value="">Todas as pessoas</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={soUrgentes} onChange={(e) => setSoUrgentes(e.target.checked)} className="accent-orange-500" /> 🔥 só urgentes
        </label>
      </div>

      {marcadas.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm dark:border-orange-900 dark:bg-orange-950/30">
          <span className="font-semibold text-zinc-800 dark:text-zinc-100">{marcadas.size} selecionado(s):</span>
          <button onClick={loteComprado} disabled={proc} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">✓ Comprado / feito</button>
          <button onClick={loteRejeitar} disabled={proc} className="rounded-lg bg-zinc-700 px-3 py-1.5 font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">✕ Rejeitar</button>
          <button onClick={() => setMarcadas(new Set())} className="text-zinc-500 underline">limpar</button>
        </div>
      )}
      {msg && <p className="mb-3 text-sm text-red-600">{msg}</p>}

      {filtradas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {aba === "pendente" ? "Nenhum pedido pendente. 🎉" : "Nada por aqui."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/60">
              <tr>
                <th className="w-8 px-3 py-2">
                  {pendentesVisiveis.length > 0 && (
                    <input
                      type="checkbox"
                      className="accent-orange-500"
                      checked={pendentesVisiveis.every((s) => marcadas.has(s.id))}
                      onChange={(e) => setMarcadas(e.target.checked ? new Set(pendentesVisiveis.map((s) => s.id)) : new Set())}
                    />
                  )}
                </th>
                <th className="px-3 py-2">Pedido</th>
                <th className="px-3 py-2">Quem</th>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtradas.map((s) => {
                const dias = diasAtras(s.criado_em);
                return (
                  <tr key={s.id} className={s.status === "pendente" && s.urgente ? "bg-red-50/60 dark:bg-red-950/20" : ""}>
                    <td className="px-3 py-2 align-top">
                      {s.status === "pendente" && (
                        <input type="checkbox" className="accent-orange-500" checked={marcadas.has(s.id)} onChange={() => alternar(s.id)} />
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {s.urgente ? "🔥 " : ""}{s.tipo === "manutencao" ? "🔧 " : "🛒 "}{s.item}
                        {s.quantidade ? <span className="font-normal text-zinc-500"> · {s.quantidade}</span> : null}
                      </div>
                      {s.motivo && <div className="text-zinc-600 dark:text-zinc-300">{s.motivo}</div>}
                      {s.resposta && <div className="mt-0.5 text-xs text-zinc-500">💬 {s.resposta}</div>}
                    </td>
                    <td className="px-3 py-2 align-top text-zinc-700 dark:text-zinc-200">{s.nome}</td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                      {fData(s.criado_em)}
                      {s.status === "pendente" && dias >= 1 && (
                        <span className={`ml-1 text-xs ${dias >= 7 ? "text-red-600" : "text-zinc-400"}`}>há {dias} d</span>
                      )}
                      {s.respondido_em && s.status !== "pendente" && (
                        <div className="text-xs text-zinc-400">{rotulo(s).toLowerCase()} {fData(s.respondido_em)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[s.status]}`}>{rotulo(s)}</span>
                    </td>
                    <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                      {s.status === "pendente" ? (
                        <>
                          <button onClick={() => comprado(s)} disabled={proc} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{s.tipo === "manutencao" ? "✓ Feito" : "✓ Comprado"}</button>
                          <button onClick={() => rejeitar(s)} disabled={proc} className="ml-1 rounded-lg bg-zinc-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">✕ Rejeitar</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => recado(s)} disabled={proc} className="text-xs text-zinc-500 underline">recado</button>
                          <button onClick={() => reabrir(s)} disabled={proc} className="ml-2 text-xs text-zinc-500 underline">reabrir</button>
                        </>
                      )}
                      <button onClick={() => excluir(s)} disabled={proc} className="ml-2 text-xs text-red-500 underline">apagar</button>
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

function NovoPedido({ pessoas, onFeito }: { pessoas: Pessoa[]; onFeito: () => void }) {
  const [colab, setColab] = useState("");
  const [tipoNovo, setTipoNovo] = useState<"compra" | "manutencao">("compra");
  const [item, setItem] = useState("");
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [proc, start] = useTransition();
  const inp = "rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

  function salvar() {
    setMsg(null);
    start(async () => {
      const r = await criarSolicitacaoPainel({ colaboradorId: colab || null, tipo: tipoNovo, item, quantidade: qtd, motivo, urgente });
      if (!r.ok) { setMsg(r.mensagem ?? "Erro."); return; }
      setItem(""); setQtd(""); setMotivo(""); setUrgente(false);
      onFeito();
    });
  }

  return (
    <div className="mb-4 grid gap-2 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-[1fr_1fr_2fr_1fr] dark:border-zinc-800 dark:bg-zinc-900">
      <select className={inp} value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value as "compra" | "manutencao")}>
        <option value="compra">🛒 Compra</option>
        <option value="manutencao">🔧 Manutenção</option>
      </select>
      <select className={inp} value={colab} onChange={(e) => setColab(e.target.value)}>
        <option value="">Quem pediu (opcional)</option>
        {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </select>
      <input className={inp} placeholder="O que precisa" value={item} onChange={(e) => setItem(e.target.value)} maxLength={200} />
      <input className={inp} placeholder="Quantidade" value={qtd} onChange={(e) => setQtd(e.target.value)} maxLength={60} />
      <input className={`${inp} md:col-span-3`} placeholder="Pra quê / observação" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="accent-orange-500" /> 🔥 urgente
        </label>
        <button onClick={salvar} disabled={proc || item.trim().length < 2} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
          {proc ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {msg && <p className="text-sm text-red-600 md:col-span-4">{msg}</p>}
    </div>
  );
}
