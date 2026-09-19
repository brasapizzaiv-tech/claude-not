"use client";

// Cardápio do dia no celular, na cozinha: letra grande, botões altos, três
// abas (Buffet, Saladas, Marmitas). O dia abre no próximo a ser servido.
import { useMemo, useState, useTransition } from "react";
import { confirmar } from "@/components/dialogo";
import { useRouter } from "next/navigation";
import { addDiasIso, diaSemanaIso, rotuloDiaLongo } from "@/lib/dia-cardapio";
import {
  CATEGORIAS_SALADA, GRUPOS, PRECOS_SUGERIDOS, chaveNome, limparNomePrato, linhas, statusCardapio,
  type CardapioDia, type EstatPrato, type Grupo, type ItemCatalogo, type Publicacao, type SaladaBase,
} from "@/lib/cardapio-dia-core";
import type { KernDia } from "@/lib/marmitas-cardapio";
import { MarmitaDiaForm, type PodeMarmita } from "@/components/marmita-dia-form";
import { CardapioHistorico } from "@/components/cardapio-historico";
import { publicarApp, salvarBuffetApp, salvarEPublicarApp, salvarMarmitaApp, salvarSaladasApp } from "./actions";

const TITULO: Record<Grupo, string> = { proteinas: "Proteínas", carboidratos: "Acompanhamentos", especial: "Especial do dia" };
const DIA_NOME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
type Aba = "buffet" | "saladas" | "marmitas";

const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
// "seg 15/09" pra última vez que o prato entrou.
const diaCurto = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return `${DIA_CURTO[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
};
const quando = (ts: string | null) =>
  ts ? new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const norm = chaveNome;

export function CardapioApp({
  token, dia, cardapio, itens, base, marcadas, padrao, historico, kern, podeMarmita, estat,
}: {
  token: string; dia: string; cardapio: CardapioDia | null; itens: ItemCatalogo[]; base: SaladaBase[];
  marcadas: string[]; padrao: string[]; historico: Publicacao[]; kern: KernDia | null; podeMarmita: PodeMarmita;
  estat: Record<string, EstatPrato>;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [aba, setAba] = useState<Aba>("buffet");
  const [msg, setMsg] = useState<string | null>(null);
  const dow = diaSemanaIso(dia);
  const sugerido = PRECOS_SUGERIDOS[dow];

  // ---- buffet
  const [sel, setSel] = useState<Record<Grupo, string[]>>({
    proteinas: linhas(cardapio?.proteinas), carboidratos: linhas(cardapio?.carboidratos), especial: linhas(cardapio?.especial),
  });
  const [sujoBuffet, setSujoBuffet] = useState(false);
  const [busca, setBusca] = useState<Record<Grupo, string>>({ proteinas: "", carboidratos: "", especial: "" });
  const status = statusCardapio(cardapio);
  const dados = () => ({
    proteinas: sel.proteinas.join("\n"), carboidratos: sel.carboidratos.join("\n"), especial: sel.especial.join("\n"),
    preco_livre: cardapio?.preco_livre ?? sugerido?.livre ?? null, preco_kg: cardapio?.preco_kg ?? sugerido?.kg ?? null,
  });
  function addItem(g: Grupo, nome: string) {
    const n = limparNomePrato(nome);
    if (!n || sel[g].some((x) => norm(x) === norm(n))) return;
    setSel((s) => ({ ...s, [g]: [...s[g], n] }));
    setBusca((b) => ({ ...b, [g]: "" }));
    setSujoBuffet(true);
  }
  function tirarItem(g: Grupo, i: number) {
    setSel((s) => ({ ...s, [g]: s[g].filter((_, j) => j !== i) }));
    setSujoBuffet(true);
  }
  // Sugestões: antes de digitar, os mais usados do grupo; digitando, filtra.
  // Cada uma traz vezes na semana/mês e a última data (dias publicados).
  const estatDe = (g: Grupo, nome: string): EstatPrato | undefined => estat[g + "|" + norm(nome)];
  function sugestoes(g: Grupo) {
    const q = norm(busca[g].trim());
    const ja = new Set(sel[g].map(norm));
    return itens
      .filter((i) => i.grupo === g && !ja.has(norm(i.nome)) && (!q || norm(i.nome).includes(q)))
      .sort((a, b) => b.usos - a.usos || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, 8);
  }
  const rotuloEstat = (e: EstatPrato | undefined) =>
    !e ? "nunca publicado" : `${e.semana}× na semana · ${e.mes}× no mês · último: ${e.ultimo ? diaCurto(e.ultimo) : "—"}`;
  async function salvarBuffet(publicar: boolean) {
    if (publicar && !await confirmar(`Publicar o cardápio de ${rotuloDiaLongo(dia)}? Site e TV passam a mostrar.`)) return;
    setMsg(null);
    start(async () => {
      const r = publicar ? await salvarEPublicarApp(token, dia, dados()) : await salvarBuffetApp(token, dia, dados());
      if (!r.ok) { setMsg(r.mensagem); return; }
      setSujoBuffet(false);
      setMsg(publicar ? "✓ Publicado! Site e TV já mostram." : cardapio?.publicado ? "✓ Salvo. O site continua com a versão publicada até você apertar Publicar." : "✓ Salvo como rascunho.");
      router.refresh();
    });
  }
  async function publicarSo() {
    if (!await confirmar(`Publicar o cardápio de ${rotuloDiaLongo(dia)}? Site e TV passam a mostrar.`)) return;
    setMsg(null);
    start(async () => {
      const r = await publicarApp(token, dia);
      setMsg(r.ok ? "✓ Publicado! Site e TV já mostram." : r.mensagem);
      router.refresh();
    });
  }

  // ---- saladas
  const temExcecao = marcadas.length > 0;
  const [selSal, setSelSal] = useState<Set<string>>(() => new Set(temExcecao ? marcadas : padrao));
  const [sujoSal, setSujoSal] = useState(false);
  const porCategoria = useMemo(
    () => CATEGORIAS_SALADA.map((c) => ({ categoria: c, itens: base.filter((s) => s.categoria === c) })).filter((g) => g.itens.length > 0),
    [base],
  );
  function alternarSalada(id: string) {
    setSelSal((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    setSujoSal(true);
  }
  function salvarSaladas(ids: string[]) {
    setMsg(null);
    start(async () => {
      const r = await salvarSaladasApp(token, dia, ids);
      if (!r.ok) { setMsg(r.mensagem); return; }
      setSujoSal(false);
      if (ids.length === 0) setSelSal(new Set(padrao));
      setMsg(ids.length === 0 ? `✓ Voltou ao padrão de ${DIA_NOME[dow]}.` : `✓ ${ids.length} salada(s) marcada(s). A TV já mostra.`);
      router.refresh();
    });
  }

  const irPara = (v: string) => router.push(`/eu/${token}/cardapio?dia=${v}`);
  const abaCls = (a: Aba) =>
    `flex-1 rounded-cartao py-3 text-base font-bold ${aba === a ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-painel-cartao text-texto-suave  "}`;
  const chip = (on: boolean) =>
    `rounded-full border px-4 py-2.5 text-base font-medium ${on ? "border-green-600 bg-texto text-fundo" : "border-borda-forte bg-painel-cartao text-texto-suave   "}`;
  const input = "h-12 w-full rounded-cartao border border-borda-forte bg-white px-3 text-base text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div>
      {/* dia + setas */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => irPara(addDiasIso(dia, -1))} className="h-12 w-12 rounded-cartao bg-painel-cartao text-2xl font-bold text-texto-suave" aria-label="dia anterior">‹</button>
        <div className="text-center">
          <p className="text-lg font-bold capitalize text-texto">{rotuloDiaLongo(dia)}</p>
          <p className="text-xs text-texto-fraco">{dia === new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) ? "hoje" : dow === 0 ? "domingo — casa fechada" : "cardápio do dia"}</p>
        </div>
        <button type="button" onClick={() => irPara(addDiasIso(dia, 1))} className="h-12 w-12 rounded-cartao bg-painel-cartao text-2xl font-bold text-texto-suave" aria-label="dia seguinte">›</button>
      </div>

      {/* status */}
      <div className="mt-3 rounded-cartao border border-borda bg-painel-cartao p-3 text-center">
        {status === "publicado" && <p className="text-base font-bold text-green-700 dark:text-green-400">● Publicado</p>}
        {status === "alterado" && <p className="text-base font-bold text-amber-700 dark:text-amber-300">● Publicado — com alterações não publicadas</p>}
        {status === "rascunho" && <p className="text-base font-bold text-texto-suave">○ Rascunho (não está no site)</p>}
        {status === "vazio" && <p className="text-base font-bold text-texto-fraco">○ Ainda sem cardápio</p>}
        {cardapio?.publicado_em && <p className="mt-0.5 text-xs text-texto-fraco">publicado por {cardapio.publicado_por ?? "?"} em {quando(cardapio.publicado_em)}</p>}
        {status === "alterado" && cardapio?.alterado_em && <p className="text-xs text-amber-600">alterado por {cardapio.alterado_por ?? "?"} em {quando(cardapio.alterado_em)}</p>}
      </div>

      {/* abas */}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setAba("buffet")} className={abaCls("buffet")}>Buffet</button>
        <button type="button" onClick={() => setAba("saladas")} className={abaCls("saladas")}>Saladas</button>
        <button type="button" onClick={() => setAba("marmitas")} className={abaCls("marmitas")}>Marmitas</button>
      </div>

      {msg && <p className="mt-3 rounded-cartao bg-superficie-suave px-3 py-2 text-base text-texto-suave">{msg}</p>}

      {/* ---- BUFFET */}
      {aba === "buffet" && (
        <div className="mt-3 space-y-4">
          {GRUPOS.map((g) => (
            <div key={g} className="rounded-cartao border border-borda bg-painel-cartao p-3">
              <p className="mb-2 text-xs font-bold text-orange-600">{TITULO[g]} <span className="text-texto-fraco">({sel[g].length})</span></p>
              <ul className="space-y-1.5">
                {sel[g].map((nome, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-cartao bg-superficie-suave px-3 py-2 text-base text-texto">
                    <span>{nome}</span>
                    <button type="button" onClick={() => tirarItem(g, i)} className="h-9 w-9 shrink-0 rounded-controle text-lg text-red-500" aria-label="tirar">✕</button>
                  </li>
                ))}
                {sel[g].length === 0 && <li className="text-sm text-texto-fraco">nenhum item</li>}
              </ul>
              <div className="mt-2 flex gap-2">
                <input
                  value={busca[g]}
                  onChange={(e) => setBusca((b) => ({ ...b, [g]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(g, busca[g]); } }}
                  placeholder="+ buscar ou digitar novo"
                  className={input}
                />
                <button type="button" onClick={() => addItem(g, busca[g])} disabled={!busca[g].trim()} className="h-12 shrink-0 rounded-cartao bg-zinc-900 px-5 text-base font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900">Add</button>
              </div>
              {sugestoes(g).length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-mini text-texto-fraco">
                    {busca[g].trim() ? "encontrados" : "mais usados"} · <span className="text-amber-600">amarelo</span> = entrou nos últimos 2 dias
                  </p>
                  {sugestoes(g).map((s) => {
                    const e = estatDe(g, s.nome);
                    const recente = !!e?.recente;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addItem(g, s.nome)}
                        className={`flex w-full flex-col items-start gap-0.5 rounded-cartao border px-3 py-2 text-left ${recente ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/40" : "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30"}`}
                      >
                        <span className={`text-base font-medium ${recente ? "text-amber-900 dark:text-amber-100" : "text-orange-900 dark:text-orange-100"}`}>+ {s.nome}</span>
                        <span className={`text-xs leading-tight ${recente ? "text-amber-700 dark:text-amber-300" : "text-texto-suave"}`}>{rotuloEstat(e)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div className="sticky bottom-3 space-y-2">
            <button type="button" onClick={() => salvarBuffet(false)} disabled={proc || !sujoBuffet} className="h-14 w-full rounded-cartao bg-zinc-900 text-lg font-bold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900">
              {proc ? "Salvando…" : "Salvar"}
            </button>
            {sujoBuffet ? (
              <button type="button" onClick={() => salvarBuffet(true)} disabled={proc} className="h-14 w-full rounded-cartao bg-texto text-lg font-bold text-fundo disabled:opacity-40">
                Salvar e publicar
              </button>
            ) : status === "alterado" || status === "rascunho" ? (
              <button type="button" onClick={publicarSo} disabled={proc} className="h-14 w-full rounded-cartao bg-texto text-lg font-bold text-fundo disabled:opacity-40">
                Publicar
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* ---- SALADAS */}
      {aba === "saladas" && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-texto-suave">
            <b>{selSal.size}</b> marcada(s) ·{" "}
            {temExcecao ? <span className="text-amber-600">seleção própria deste dia</span> : <>seguindo o padrão de {DIA_NOME[dow]}</>}
          </p>
          {porCategoria.map((g) => (
            <div key={g.categoria} className="rounded-cartao border border-borda bg-painel-cartao p-3">
              <p className="mb-2 text-xs font-bold text-green-700">{g.categoria}</p>
              <div className="flex flex-wrap gap-2">
                {g.itens.map((s) => (
                  <button key={s.id} type="button" onClick={() => alternarSalada(s.id)} className={chip(selSal.has(s.id))} disabled={proc}>
                    {selSal.has(s.id) ? "✓ " : ""}{s.nome}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="sticky bottom-3 space-y-2">
            <button type="button" onClick={() => salvarSaladas([...selSal])} disabled={proc || !sujoSal} className="h-14 w-full rounded-cartao bg-texto text-lg font-bold text-fundo disabled:opacity-40">
              {proc ? "Salvando…" : "Salvar saladas deste dia"}
            </button>
            {temExcecao && (
              <button type="button" onClick={async () => { if (await confirmar(`Voltar ao padrão de ${DIA_NOME[dow]}?`)) salvarSaladas([]); }} disabled={proc} className="h-12 w-full rounded-cartao border border-borda-forte bg-painel-cartao text-base font-semibold text-texto-suave">
                Voltar ao padrão de {DIA_NOME[dow]}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---- MARMITAS */}
      {aba === "marmitas" && (
        <div className="mt-3 rounded-cartao border border-borda bg-painel-cartao p-3">
          <p className="mb-2 text-xs font-bold text-orange-600">Marmitas {kern?.nomeConvenio ?? "Kern"}</p>
          <MarmitaDiaForm dia={dia} kern={kern} pode={podeMarmita} salvar={(d, dados) => salvarMarmitaApp(token, d, dados)} grande />
        </div>
      )}

      {/* histórico do dia */}
      <div className="mt-6 rounded-cartao border border-borda bg-painel-cartao p-3">
        <p className="mb-1 text-xs font-bold text-texto-fraco">Histórico deste dia</p>
        <CardapioHistorico itens={historico} mostrarDia={false} />
      </div>
    </div>
  );
}
