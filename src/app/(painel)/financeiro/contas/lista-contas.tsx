"use client";

import { useMemo, useState, useTransition } from "react";
import { Enviar } from "@/components/enviar";
import { confirmar } from "@/components/dialogo";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import { alternarPago, ajustarValorConta, pagarVarias } from "../actions";
import type { LinhaConta } from "./consulta";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const curto = (iso: string) => dataBR(iso).slice(0, 5); // 25/08

// Contas com data "AAAA-MM-DD": soma/lê o dia em UTC para não escorregar de fuso.
function addDias(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
function diaDaSemana(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
}
// "2026-07-01" -> "jul/26" (a competência é mês, o dia não importa).
const MESES_CURTOS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
function mesBR(iso: string) {
  const [ano, mes] = String(iso).split("-");
  return `${MESES_CURTOS[Number(mes) - 1] ?? mes}/${String(ano).slice(2)}`;
}

// Segunda-feira da semana do vencimento (semana fecha segunda → domingo).
function segundaDa(iso: string) {
  return addDias(iso, -((diaDaSemana(iso) + 6) % 7));
}

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");


// Valor do boleto: clicar abre a edição. O boleto quase nunca fecha com a nota
// (custas, juros, desconto do banco) — aqui se coloca o valor cobrado de
// verdade. Em conta de nota, a diferença vira uma linha de "Despesas
// Bancárias" e o valor da mercadoria (CMV) fica intacto.
function ValorConta({ l }: { l: LinhaConta }) {
  const [editando, setEditando] = useState(false);
  const custas = Number(l.custas ?? 0);

  if (!editando)
    return (
      <button
        onClick={() => setEditando(true)}
        title="Ajustar o valor cobrado no boleto"
        className="w-full text-right"
      >
        <span className="font-medium text-zinc-800 underline decoration-dotted decoration-zinc-300 underline-offset-4 hover:text-orange-600 dark:text-zinc-200">
          {moeda(Number(l.valor))}
        </span>
        {Math.abs(custas) >= 0.01 && (
          <span className="block text-mini text-amber-600">
            {custas > 0 ? "+" : "−"} {moeda(Math.abs(custas))}{" "}
            {custas > 0 ? "de custas" : "de desconto"}
          </span>
        )}
      </button>
    );

  return (
    <form
      action={async (fd: FormData) => {
        await ajustarValorConta(fd);
        setEditando(false);
      }}
      className="flex items-center justify-end gap-1"
    >
      <input type="hidden" name="ids" value={(l.ids ?? [l.id]).join(",")} />
      <input
        name="valor"
        autoFocus
        inputMode="decimal"
        defaultValue={Number(l.valor).toFixed(2).replace(".", ",")}
        className="w-24 rounded-controle border border-borda-forte bg-white px-2 py-1 text-right text-sm text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950"
      />
      <Enviar
        className="rounded-controle bg-orange-500 px-2 py-1 text-xs font-medium text-white hover:bg-orange-600"
        title="Salvar o valor do boleto"
      >
        ✓
      </Enviar>
      <button
        type="button"
        onClick={() => setEditando(false)}
        className="text-xs text-texto-fraco hover:text-texto-suave"
      >
        ✕
      </button>
    </form>
  );
}

type Selecao = { marcadas: Set<string>; alternar: (id: string) => void };

/** Por qual coluna a lista está ordenada. `null` = como o sistema monta
 *  (por vencimento), que é o padrão e o mais útil no dia a dia. */
export type Ordem = { campo: "conta" | "valor"; desc: boolean } | null;

/** O texto que aparece como nome da conta — é por ele que a ordem alfabética
 *  vai, e não pelo que está guardado no banco: a pessoa ordena pelo que vê. */
const nomeDaConta = (l: LinhaConta) =>
  (l.descricao ?? l.fornecedores?.nome ?? "Despesa").trim();

function ordenar(itens: LinhaConta[], ordem: Ordem) {
  if (!ordem) return itens;
  const sinal = ordem.desc ? -1 : 1;
  // Cópia: ordenar no lugar mexeria na lista que o agrupamento montou.
  return [...itens].sort((a, b) => {
    if (ordem.campo === "valor") return (Number(a.valor) - Number(b.valor)) * sinal;
    // localeCompare com pt-BR pra "Ácido" ficar junto de "Acido", e não no fim.
    return nomeDaConta(a).localeCompare(nomeDaConta(b), "pt-BR") * sinal;
  });
}

/** Cabeçalho que ordena. Uma seta diz por onde está e pra que lado. */
function Cabecalho({
  rotulo, campo, ordem, aoOrdenar, alinhar,
}: {
  rotulo: string;
  campo: "conta" | "valor";
  ordem: Ordem;
  aoOrdenar: (campo: "conta" | "valor") => void;
  alinhar: "left" | "right";
}) {
  const ativa = ordem?.campo === campo;
  return (
    <th className={`px-4 py-2 font-medium text-${alinhar}`}>
      <button
        type="button"
        onClick={() => aoOrdenar(campo)}
        className={`inline-flex items-center gap-1 rounded-controle px-1 py-0.5 transition hover:text-texto ${ativa ? "text-texto" : ""}`}
        title={
          campo === "valor"
            ? "Ordenar pelo valor (clique de novo pra inverter)"
            : "Ordenar pelo nome (clique de novo pra inverter)"
        }
      >
        {rotulo}
        {/* A seta só aparece na coluna que está ordenando: duas setas na tela
            deixariam dúvida sobre qual manda. */}
        <span aria-hidden className={ativa ? "" : "opacity-0"}>
          {ordem?.desc ? "↓" : "↑"}
        </span>
      </button>
    </th>
  );
}

function Linhas({
  itens,
  mostrarPago,
  hojeBR,
  selecao,
  ordem = null,
  aoOrdenar,
}: {
  itens: LinhaConta[];
  mostrarPago?: boolean;
  hojeBR: string;
  selecao?: Selecao;
  ordem?: Ordem;
  aoOrdenar?: (campo: "conta" | "valor") => void;
}) {
  const lista = ordenar(itens, ordem);
  return (
    <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
      <table className="min-w-[560px] w-full text-sm">
        <thead>
          <tr className="text-xs text-texto-fraco">
            {selecao && <th className="w-8" />}
            {aoOrdenar ? (
              <>
                <Cabecalho rotulo="Conta" campo="conta" ordem={ordem} aoOrdenar={aoOrdenar} alinhar="left" />
                <Cabecalho rotulo="Valor" campo="valor" ordem={ordem} aoOrdenar={aoOrdenar} alinhar="right" />
              </>
            ) : (
              <>
                <th className="px-4 py-2 text-left font-medium">Conta</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
              </>
            )}
            <th className="px-4 py-2 text-right font-medium">Situação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {lista.map((l) => (
            <tr key={l.id} className={selecao?.marcadas.has(l.id) ? "bg-superficie-suave" : ""}>
              {/* A célula existe SEMPRE que há seleção, mesmo na conta já paga:
                  se some numa linha e fica na outra, a tabela desalinha. */}
              {selecao && (
                <td className="w-8 pl-3">
                  {!l.pago && (
                    <input
                      type="checkbox"
                      checked={selecao.marcadas.has(l.id)}
                      onChange={() => selecao.alternar(l.id)}
                      className="h-4 w-4 accent-[var(--sucesso)]"
                      title="Selecionar pra pagar em lote"
                    />
                  )}
                </td>
              )}
              <td className="px-4 py-2">
                <div className="font-medium text-texto">
                  {l.descricao ?? l.fornecedores?.nome ?? "Despesa"}
                </div>
                <div className="text-xs text-texto-suave">
                  {l.dre_categorias?.nome ?? ""}
                  {l.vencimento ? ` · vence ${dataBR(l.vencimento)}` : ""}
                  {l.banco ? ` · ${l.banco}` : ""}
                  {l.forma_pagamento ? ` · ${l.forma_pagamento}` : ""}
                  {mostrarPago && l.pago_em ? ` · pago ${dataBR(l.pago_em)}` : ""}
                </div>
                {/* As outras datas da conta (competência, emissão, cadastro) */}
                <div className="text-mini text-texto-fraco">
                  {l.data ? `comp. ${mesBR(l.data)}` : ""}
                  {l.emissao ? ` · emitida ${dataBR(l.emissao)}` : ""}
                  {l.lancamento_em ? ` · lançada ${dataBR(l.lancamento_em)}` : ""}
                </div>
              </td>
              <td className="px-4 py-2 text-right font-numero tracking-apertada">
                <ValorConta l={l} />
              </td>
              <td className="px-4 py-2 text-right">
                <form action={alternarPago} className="inline-flex items-center gap-1.5">
                  <input type="hidden" name="ids" value={(l.ids ?? [l.id]).join(",")} />
                  <input type="hidden" name="pago" value={l.pago ? "false" : "true"} />
                  {!l.pago && (
                    <input
                      type="date"
                      name="data_pago"
                      defaultValue={hojeBR}
                      title="Data do pagamento (padrão: hoje)"
                      className="rounded-controle border border-borda-forte bg-transparent px-2 py-1 font-numero text-xs text-texto focus:border-primaria"
                    />
                  )}
                  <span
                    className={`rounded-controle px-2 py-1 text-xs font-medium ${
                      l.pago
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : l.vencimento && l.vencimento < hojeBR
                          ? "bg-red-500/15 text-red-700 dark:text-red-300"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {l.pago ? "Paga" : l.vencimento && l.vencimento < hojeBR ? "Vencida" : "Em aberto"}
                  </span>
                  <Enviar
                    className={`min-h-11 rounded-controle px-3 text-xs font-medium transition ${
                      l.pago
                        ? "border border-borda-forte text-texto-suave hover:bg-superficie-suave"
                        : "bg-texto text-fundo hover:opacity-90"
                    }`}
                  >
                    {l.pago ? "Reabrir" : "Pagar"}
                  </Enviar>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ListaContasView({
  linhas,
  aberto,
}: {
  linhas: LinhaConta[];
  aberto: boolean;
}) {
  const [busca, setBusca] = useState("");

  // Por qual coluna a lista está ordenada. Vale pra tela toda, e ordena DENTRO
  // de cada grupo — a divisão por vencimento continua mandando, porque é ela
  // que diz o que precisa ser pago primeiro. Clicar de novo inverte; a terceira
  // vez volta pro normal (por vencimento).
  const [ordem, setOrdem] = useState<Ordem>(null);
  // Cada coluna tem TRÊS estados, nesta ordem: o jeito natural dela, o
  // contrário, e de volta ao normal (por vencimento).
  //   Valor →  maior primeiro  ·  menor primeiro  ·  desliga
  //   Conta →  A a Z           ·  Z a A           ·  desliga
  // O "jeito natural" muda por coluna de propósito: procurar conta grande é o
  // uso comum do valor, e ninguém procura fornecedor começando pelo Z.
  const aoOrdenar = (campo: "conta" | "valor") =>
    setOrdem((o) => {
      const padrao = campo === "valor"; // valor começa do maior
      if (o?.campo !== campo) return { campo, desc: padrao };
      if (o.desc === padrao) return { campo, desc: !padrao }; // ainda no padrão: inverte
      return null; // já estava invertida: volta pro normal
    });
  const hojeBR = new Date(new Date().getTime() - 3 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  // Seleção pra dar baixa em lote (só nas abertas).
  const router = useRouter();
  const [pagando, startPagar] = useTransition();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [dataLote, setDataLote] = useState(hojeBR);
  const [msgLote, setMsgLote] = useState<string | null>(null);
  const alternar = (id: string) =>
    setMarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selecao: Selecao | undefined = aberto ? { marcadas, alternar } : undefined;
  const selecionadas = useMemo(() => linhas.filter((l) => marcadas.has(l.id)), [linhas, marcadas]);
  const totalSel = selecionadas.reduce((s, l) => s + Number(l.valor), 0);
  async function pagarSelecionadas() {
    if (selecionadas.length === 0) return;
    if (!await confirmar(`Dar baixa em ${selecionadas.length} conta(s) — ${moeda(totalSel)} — com pagamento em ${dataBR(dataLote)}?`)) return;
    const ids = selecionadas.flatMap((l) => l.ids ?? [l.id]);
    startPagar(async () => {
      const r = await pagarVarias(ids, dataLote);
      if (r.ok) {
        setMsgLote(`✓ ${selecionadas.length} conta(s) baixada(s).`);
        setMarcadas(new Set());
        router.refresh();
      } else {
        setMsgLote(r.mensagem || "Não foi possível.");
      }
      setTimeout(() => setMsgLote(null), 4000);
    });
  }

  const filtradas = useMemo(() => {
    const q = norm(busca.trim());
    if (!q) return linhas;
    return linhas.filter(
      (l) =>
        norm(l.descricao ?? "").includes(q) ||
        norm(l.fornecedores?.nome ?? "").includes(q) ||
        norm(l.dre_categorias?.nome ?? "").includes(q),
    );
  }, [busca, linhas]);

  // Abertas: vencidas em bloco, o resto por DIA, dentro da semana (seg → dom).
  const grupos = useMemo(() => {
    const vencidas: LinhaConta[] = [];
    const semVenc: LinhaConta[] = [];
    const porDia = new Map<string, LinhaConta[]>();
    if (aberto)
      for (const l of filtradas) {
        if (!l.vencimento) semVenc.push(l);
        else if (l.vencimento < hojeBR) vencidas.push(l);
        else {
          const a = porDia.get(l.vencimento) ?? [];
          a.push(l);
          porDia.set(l.vencimento, a);
        }
      }

    type Dia = { iso: string; itens: LinhaConta[]; total: number };
    type Semana = { inicio: string; fim: string; dias: Dia[]; total: number };
    const semanas = new Map<string, Semana>();
    for (const iso of [...porDia.keys()].sort()) {
      const itens = porDia.get(iso)!;
      const total = itens.reduce((s, l) => s + Number(l.valor), 0);
      const inicio = segundaDa(iso);
      const sem =
        semanas.get(inicio) ??
        { inicio, fim: addDias(inicio, 6), dias: [], total: 0 };
      sem.dias.push({ iso, itens, total });
      sem.total += total;
      semanas.set(inicio, sem);
    }

    return {
      vencidas,
      semVenc,
      semanas: [...semanas.values()],
      totalVencidas: vencidas.reduce((s, l) => s + Number(l.valor), 0),
      totalSemVenc: semVenc.reduce((s, l) => s + Number(l.valor), 0),
    };
  }, [filtradas, aberto, hojeBR]);

  const estaSemana = segundaDa(hojeBR);
  const rotuloSemana = (inicio: string) =>
    inicio === estaSemana
      ? "esta semana"
      : inicio === addDias(estaSemana, 7)
        ? "próxima semana"
        : null;
  const rotuloDia = (iso: string) =>
    iso === hojeBR ? "hoje" : iso === addDias(hojeBR, 1) ? "amanhã" : null;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar conta por descrição, fornecedor ou categoria..."
          className="min-h-11 w-full max-w-md rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
        />
        {busca && (
          <button
            onClick={() => setBusca("")}
            className="text-xs text-texto-fraco hover:text-orange-600"
          >
            limpar
          </button>
        )}
        <span className="ml-auto text-xs text-texto-fraco">
          {filtradas.length} de {linhas.length}
        </span>
      </div>

      {aberto && (
        <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-cartao bg-painel-cartao px-3 py-2 text-sm">
          <span className="font-medium text-texto">
            {marcadas.size === 0 ? "Marque as contas pagas na caixinha e dê baixa em lote" : `${marcadas.size} selecionada(s) · ${moeda(totalSel)}`}
          </span>
          {marcadas.size > 0 && (
            <>
              <button onClick={() => setMarcadas(new Set(filtradas.filter((l) => !l.pago).map((l) => l.id)))} className="text-xs text-texto-suave underline hover:text-texto">todas da busca</button>
              <button onClick={() => setMarcadas(new Set())} className="text-xs text-texto-suave underline">limpar</button>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-texto-suave">
                pago em
                <input type="date" value={dataLote} onChange={(e) => setDataLote(e.target.value)} className="rounded-controle border border-borda-forte bg-painel-cartao px-2 py-1 text-xs text-texto-suave " />
              </label>
              <button
                onClick={pagarSelecionadas}
                disabled={pagando}
                className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90 disabled:opacity-60"
              >
                {pagando ? "Baixando..." : `✓ Dar baixa em ${marcadas.size}`}
              </button>
            </>
          )}
          {msgLote && <span className="w-full text-xs font-medium text-sucesso">{msgLote}</span>}
        </div>
      )}

      {filtradas.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-10 text-center text-texto-suave">
          {busca ? (
            <>
              Nenhuma conta encontrada para <b>{busca}</b>.
            </>
          ) : (
            "Nenhuma conta com esses filtros."
          )}
        </div>
      ) : aberto ? (
        <div className="space-y-8">
          {grupos.vencidas.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-red-600">Vencidas</h2>
                <span className="text-sm font-medium text-red-600">
                  {moeda(grupos.totalVencidas)}
                </span>
              </div>
              <Linhas itens={grupos.vencidas} hojeBR={hojeBR} selecao={selecao} ordem={ordem} aoOrdenar={aoOrdenar} />
            </section>
          )}

          {grupos.semanas.map((sem) => {
            const rot = rotuloSemana(sem.inicio);
            return (
              <section key={sem.inicio}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-borda pb-1.5">
                  <h2 className="text-sm font-semibold text-texto">
                    Semana {curto(sem.inicio)} a {curto(sem.fim)}
                    {rot && (
                      <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-mini font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                        {rot}
                      </span>
                    )}
                  </h2>
                  <span className="text-sm font-semibold text-texto-suave">
                    {moeda(sem.total)}
                  </span>
                </div>
                <div className="space-y-4">
                  {sem.dias.map((d) => {
                    const rd = rotuloDia(d.iso);
                    return (
                      <div key={d.iso}>
                        <div className="mb-1 flex items-center justify-between">
                          <h3 className="text-xs font-medium text-texto-suave">
                            {DIAS[diaDaSemana(d.iso)]} {curto(d.iso)}
                            {rd && (
                              <span className="ml-1.5 font-semibold text-orange-600">
                                · {rd}
                              </span>
                            )}
                          </h3>
                          <span className="text-xs font-medium text-texto-suave">
                            {moeda(d.total)}
                          </span>
                        </div>
                        <Linhas itens={d.itens} hojeBR={hojeBR} selecao={selecao} ordem={ordem} aoOrdenar={aoOrdenar} />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {grupos.semVenc.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-texto-fraco">Sem vencimento</h2>
                <span className="text-sm font-medium text-texto-suave">
                  {moeda(grupos.totalSemVenc)}
                </span>
              </div>
              <Linhas itens={grupos.semVenc} hojeBR={hojeBR} selecao={selecao} ordem={ordem} aoOrdenar={aoOrdenar} />
            </section>
          )}
        </div>
      ) : (
        <Linhas itens={filtradas} mostrarPago hojeBR={hojeBR} ordem={ordem} aoOrdenar={aoOrdenar} />
      )}
    </div>
  );
}
