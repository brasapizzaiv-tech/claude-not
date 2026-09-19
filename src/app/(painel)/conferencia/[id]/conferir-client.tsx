"use client";
import { Icone } from "@/components/icone";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import { Combobox } from "@/components/combobox";
import {
  salvarConferencia,
  adicionarItemConferencia,
  removerItemConferencia,
  ligarNotaConferencia,
} from "../actions";
import { ROTULO_DIVERGENCIA, type ResumoDivergencias } from "@/lib/conferencia-core";

export type ItemLinha = {
  id: string;
  nome: string;
  unidade: string;
  qtd: number;
  preco_unit: number | null;
  qtd_recebida: number | null;
  preco_recebido: number | null;
  qtd_conf_colab: number | null; // o que a equipe contou no app
  obs: string | null;
  nota_qtd: number | null;   // da nota ligada (× fator), por produto
  nota_preco: number | null; // preço por unidade do produto na nota
};
export type NotaLigada = { id: string; numero: string | null; valor: number; data_emissao: string | null; itens: number; semVinculo: number };
export type NotaSugerida = { id: string; numero: string | null; valor: number; data_emissao: string | null };
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtQ = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 }));

type Estado = { qtd_recebida: string; preco_recebido: string; obs: string };

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Item adicionado depois (chega via router.refresh) ainda não tem estado — cai
// no valor que veio do pedido.
const estadoDe = (estado: Record<string, Estado>, i: ItemLinha): Estado =>
  estado[i.id] ?? {
    qtd_recebida: String(i.qtd_recebida ?? i.qtd_conf_colab ?? i.qtd),
    preco_recebido: String(i.preco_recebido ?? i.preco_unit ?? ""),
    obs: i.obs ?? "",
  };
const numInput =
  "w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function ConferirClient({
  pedidoId,
  fornecedor,
  cotacao,
  data,
  status,
  observacoes,
  confColab,
  itens,
  produtos,
  nota,
  sugeridas,
  divergencias,
}: {
  pedidoId: string;
  fornecedor: string;
  cotacao: string;
  data: string;
  status: string;
  observacoes: string;
  confColab: { em: string; por: string | null } | null;
  itens: ItemLinha[];
  produtos: { id: string; nome: string }[];
  nota: NotaLigada | null;
  sugeridas: NotaSugerida[];
  divergencias: ResumoDivergencias;
}) {
  const router = useRouter();
  const [salvando, startSave] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ligando, startLigar] = useTransition();
  function ligarNota(notaId: string | null) {
    if (!notaId && !confirm("Desligar a nota deste pedido?")) return;
    startLigar(async () => {
      const r = await ligarNotaConferencia(pedidoId, notaId);
      if (!r.ok) { setMsg(("mensagem" in r && r.mensagem) || "Não consegui ligar a nota."); return; }
      router.refresh();
    });
  }
  const [obsGeral, setObsGeral] = useState(observacoes);
  const [addProd, setAddProd] = useState("");
  const [addQtd, setAddQtd] = useState("");
  const [estado, setEstado] = useState<Record<string, Estado>>({});

  const num = (s: string) => {
    // "1.234,56" → 1234.56 ; "1,5" → 1.5 ; "1.5" → 1.5
    const t = (s ?? "").trim();
    const v = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
    return isNaN(v) ? 0 : v;
  };

  const totais = useMemo(() => {
    let pedido = 0;
    let recebido = 0;
    for (const i of itens) {
      pedido += (i.preco_unit ?? 0) * i.qtd;
      const e = estadoDe(estado, i);
      recebido += num(e.preco_recebido) * num(e.qtd_recebida);
    }
    return { pedido, recebido };
  }, [estado, itens]);

  const payloadAtual = () =>
    itens.map((i) => {
      const e = estadoDe(estado, i);
      return {
        id: i.id,
        qtd_recebida: num(e.qtd_recebida),
        preco_recebido: e.preco_recebido ? num(e.preco_recebido) : null,
        obs: e.obs || null,
      };
    });

  function persistir(finalizar: boolean) {
    startSave(async () => {
      await salvarConferencia(pedidoId, payloadAtual(), obsGeral, finalizar);
      if (finalizar) {
        router.push("/conferencia");
      } else {
        setMsg("Conferência salva.");
        setTimeout(() => setMsg(null), 4000);
      }
    });
  }

  // Adiciona um item que veio a mais (salva as edições atuais antes, pra não perder).
  function adicionar() {
    if (!addProd || num(addQtd) <= 0) return;
    startSave(async () => {
      await salvarConferencia(pedidoId, payloadAtual(), obsGeral, false);
      await adicionarItemConferencia(pedidoId, addProd, num(addQtd));
      setAddProd("");
      setAddQtd("");
      router.refresh();
    });
  }
  function remover(itemId: string) {
    startSave(async () => {
      await salvarConferencia(pedidoId, payloadAtual(), obsGeral, false);
      await removerItemConferencia(itemId, pedidoId);
      router.refresh();
    });
  }

  const conferido = status === "conferido";

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link
        href="/conferencia"
        className="text-sm text-zinc-500 hover:text-orange-600"
      >
        ← Voltar para conferência
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {fornecedor}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {cotacao ? `${cotacao} · ` : ""}
            {dataBR(data)} · {status}
            {confColab && <> · <span className="text-emerald-700 dark:text-emerald-400">✓ recebido pela equipe ({confColab.por ?? "?"}, {quando(confColab.em)})</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => persistir(false)}
            disabled={salvando}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Salvar
          </button>
          <button
            onClick={() => persistir(true)}
            disabled={salvando}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {conferido ? "Atualizar conferência" : "Confirmar conferência"}
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {msg}
        </div>
      )}

      {/* Nota fiscal ligada ao pedido */}
      <div className="mb-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100"><Icone nome="cupom" tamanho={14} className="mr-1.5" /> Nota fiscal do fornecedor</p>
            {nota ? (
              <p className="text-sm text-zinc-500">
                Nota <b className="text-zinc-800 dark:text-zinc-100">{nota.numero ?? "s/nº"}</b>
                {nota.data_emissao ? ` de ${dataBR(nota.data_emissao)}` : ""} · {moeda(nota.valor)} · {nota.itens} item(ns)
                {Math.abs(nota.valor - totais.pedido) > 0.01
                  ? <span className="ml-1 text-amber-600">(pedido {moeda(totais.pedido)}, dif {moeda(nota.valor - totais.pedido)})</span>
                  : <span className="ml-1 text-emerald-600">(bate com o pedido ✓)</span>}
                {nota.semVinculo > 0 && <span className="ml-1 text-amber-600">· {nota.semVinculo} item(ns) da nota sem produto vinculado</span>}
              </p>
            ) : (
              <p className="text-sm text-zinc-500">Nenhuma nota ligada. {sugeridas.length > 0 ? "Notas deste fornecedor perto da data:" : "Quando a nota entrar em Notas fiscais, ela aparece aqui pra ligar."}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {nota ? (
              <>
                <Link href={`/notas/${nota.id}`} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300">Abrir nota</Link>
                <button onClick={() => ligarNota(null)} disabled={ligando} className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50">Desligar</button>
              </>
            ) : (
              sugeridas.map((n) => (
                <button
                  key={n.id}
                  onClick={() => ligarNota(n.id)}
                  disabled={ligando}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${Math.abs(Number(n.valor) - totais.pedido) <= 0.01 ? "border-emerald-500 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"}`}
                >
                  Ligar nota {n.numero ?? "s/nº"}{n.data_emissao ? ` · ${dataBR(n.data_emissao)}` : ""} · {moeda(Number(n.valor))}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Divergências calculadas (pedido × equipe/painel × nota) */}
      {divergencias.n > 0 && (
        <div className={`mb-4 rounded-2xl border p-4 ${divergencias.gravidade === "grave" ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"}`}>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            <Icone nome="alerta" tamanho={14} className="mr-1.5" /> {divergencias.n} divergência{divergencias.n === 1 ? "" : "s"}
            {divergencias.valor_a_mais > 0 && <span className="ml-2 text-red-700 dark:text-red-300">· {moeda(divergencias.valor_a_mais)} cobrados a mais</span>}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-200">
            {divergencias.itens.map((d, i) => (
              <li key={i}>
                <b>{d.produto}</b>: {ROTULO_DIVERGENCIA[d.tipo]}
                {d.tipo === "qtd_recebida" || d.tipo === "faltou" ? ` — pedido ${fmtQ(d.pedido)}, recebido ${fmtQ(d.recebido)}` : ""}
                {d.tipo === "veio_a_mais" ? ` — recebido ${fmtQ(d.recebido)}` : ""}
                {d.tipo === "preco_nota_acima" || d.tipo === "preco_nota_abaixo" ? ` — cotado ${moeda(d.preco_cotado ?? 0)}, nota ${moeda(d.preco_nota ?? 0)}` : ""}
                {d.tipo === "qtd_nota" ? ` — pedido ${fmtQ(d.pedido)}, nota ${fmtQ(d.nota)}` : ""}
                {d.tipo === "cobrado_nao_recebido" ? ` — nota ${fmtQ(d.nota)}, recebido ${fmtQ(d.recebido)}` : ""}
                {d.tipo === "nota_sem_pedido" ? ` — ${fmtQ(d.nota)} × ${d.preco_nota != null ? moeda(d.preco_nota) : "—"}` : ""}
                {d.tipo === "unidade_diferente" ? ` — nota ${moeda(d.preco_nota ?? 0)} × ${fmtQ(d.nota)} vs cotado ${moeda(d.preco_cotado ?? 0)}: parece caixa de ${d.recebido}, ajuste o fator na nota` : ""}
                {d.valor != null && d.valor !== 0 ? <span className={d.valor > 0 ? "ml-1 text-red-700 dark:text-red-300" : "ml-1 text-emerald-700 dark:text-emerald-300"}>({d.valor > 0 ? "+" : ""}{moeda(d.valor)})</span> : null}
              </li>
            ))}
          </ul>
          {!divergencias.tem_conferencia && <p className="mt-2 text-xs text-zinc-500">Ainda sem contagem da equipe: as divergências de quantidade aparecem quando alguém confirmar o recebimento no app ou aqui.</p>}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-3">Produto</th>
              <th className="px-3 py-3 text-right">Pedido</th>
              <th className="px-3 py-3 text-right" title="O que a equipe contou no app ao receber">Equipe</th>
              <th className="px-3 py-3 text-right">Recebido</th>
              <th className="px-3 py-3 text-right">R$ cotado</th>
              <th className="px-3 py-3 text-right">R$ nota</th>
              <th className="px-3 py-3 text-right" title="Da nota fiscal ligada: quantidade (já convertida) e preço por unidade">Na nota</th>
              <th className="px-3 py-3">Obs.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {itens.map((i) => {
              const e = estadoDe(estado, i);
              const divQtd = num(e.qtd_recebida) !== i.qtd;
              const divPreco =
                e.preco_recebido !== "" &&
                num(e.preco_recebido) !== (i.preco_unit ?? 0);
              const set = (campo: keyof Estado, v: string) =>
                setEstado((s) => ({ ...s, [i.id]: { ...estadoDe(s, i), [campo]: v } }));
              return (
                <tr key={i.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {i.nome}
                    <span className="ml-1 text-xs text-zinc-400">
                      {i.unidade}
                    </span>
                    {i.qtd === 0 && (
                      <span className="ml-1 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                        veio a mais
                      </span>
                    )}
                    <button
                      onClick={() => remover(i.id)}
                      disabled={salvando}
                      className="ml-2 text-xs text-zinc-300 hover:text-red-600 disabled:opacity-50 dark:text-zinc-600"
                      title="Remover item da conferência"
                    >
                      ✕
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500">{i.qtd}</td>
                  <td className={`px-3 py-2 text-right ${i.qtd_conf_colab != null && i.qtd_conf_colab !== i.qtd ? "font-semibold text-amber-600" : "text-zinc-500"}`}>
                    {i.qtd_conf_colab != null ? fmtQ(i.qtd_conf_colab) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      inputMode="decimal"
                      value={e.qtd_recebida}
                      onChange={(ev) => set("qtd_recebida", ev.target.value)}
                      className={`${numInput} ${
                        divQtd ? "border-amber-400 text-amber-600" : ""
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {i.preco_unit != null ? moeda(i.preco_unit) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      inputMode="decimal"
                      placeholder="—"
                      value={e.preco_recebido}
                      onChange={(ev) => set("preco_recebido", ev.target.value)}
                      className={`${numInput} ${
                        divPreco ? "border-amber-400 text-amber-600" : ""
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {i.nota_qtd != null ? (
                      <>
                        <span className={i.nota_qtd !== i.qtd ? "font-semibold text-amber-600" : "text-zinc-600 dark:text-zinc-300"}>{fmtQ(i.nota_qtd)}</span>
                        <span className="text-zinc-400"> · </span>
                        <span className={i.nota_preco != null && i.preco_unit != null && i.nota_preco > i.preco_unit + 0.004 ? "font-semibold text-red-600" : "text-zinc-600 dark:text-zinc-300"}>{i.nota_preco != null ? moeda(i.nota_preco) : "—"}</span>
                      </>
                    ) : nota ? <span className="text-zinc-300 dark:text-zinc-600" title="Produto não encontrado na nota (ou item da nota sem vínculo)">não está na nota</span> : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={e.obs}
                      onChange={(ev) => set("obs", ev.target.value)}
                      placeholder="ok / faltou / avariado"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900">
              <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">
                Totais
              </td>
              <td colSpan={3} className="px-3 py-3 text-right text-zinc-500">
                pedido {moeda(totais.pedido)}
              </td>
              <td colSpan={4} className="px-3 py-3 text-right text-zinc-900 dark:text-zinc-100">
                recebido {moeda(totais.recebido)}
                {totais.recebido !== totais.pedido && (
                  <span className="ml-2 text-amber-600">
                    (dif {moeda(totais.recebido - totais.pedido)})
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Adicionar item que veio a mais */}
      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-sky-300 bg-sky-50/40 p-3 dark:border-sky-800 dark:bg-sky-950/10">
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-xs text-zinc-500">
            Adicionar item que veio a mais (não estava no pedido)
          </label>
          <Combobox
            options={produtos.map((p) => ({ value: p.id, label: p.nome }))}
            value={addProd}
            onChange={setAddProd}
            placeholder="Buscar produto..."
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Qtd recebida</label>
          <input
            inputMode="decimal"
            value={addQtd}
            onChange={(e) => setAddQtd(e.target.value)}
            placeholder="0"
            className={numInput}
          />
        </div>
        <button
          onClick={adicionar}
          disabled={salvando || !addProd || num(addQtd) <= 0}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          + Adicionar
        </button>
      </div>

      <label className="mt-4 block text-sm text-zinc-500">
        Observações gerais
        <textarea
          rows={2}
          value={obsGeral}
          onChange={(e) => setObsGeral(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>
    </div>
  );
}
