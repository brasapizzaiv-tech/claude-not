"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icone, type NomeIcone } from "@/components/icone";
import { buscarRapido } from "./actions";

// Tela inicial do painel — layout novo (out/2026), protótipo aprovado em
// docs/referencia-layout/painel-claro.html e painel-escuro.html.
//
// Só desenho: os dados chegam prontos de page.tsx.
//
// Regras de cor (CLAUDE.md, "Layout do painel"): laranja forte só no botão
// principal, nas mesas ocupadas e na linha do faturamento. O resto do destaque
// é pêssego. Um cartão de foco por tela — aqui, o caixa do dia.

export type Mesa = {
  numero: number;
  estado: "livre" | "ocupada" | "conta";
  comandaId: string | null;
  contaPor: string | null;
};

export type DadosInicio = {
  nome: string;
  saudacao: string;   // "Boa noite"
  dia: string;        // AAAA-MM-DD
  diaLegivel: string; // "Sexta-feira, 19 de setembro"
  ehHoje: boolean;
  indicadores: {
    chave: string;
    rotulo: string;
    valor: string;
    variacao: number | null;     // % contra o mesmo dia da semana passada
    diferenca?: number;          // ou diferença em unidades
    serie: number[];
    detalhe?: { rotulo: string; n: number; href: string }[];
  }[];
  caixa: { aberto: boolean; valor: string; desde: string | null; pix: string; cartao: string; dinheiro: string };
  salao: {
    grupos: { nome: string; mesas: Mesa[] }[];
    ocupadas: number;
    livres: number;
    conta: number;
    maisAntiga: { numero: number; rotulo: string; minutos: number; comandaId: string } | null;
    rodizioDia: number;
  };
  delivery: { aberto: boolean; cozinha: number; rua: number; entregues: number; tempoMedio: number | null };
  pendencias: { rotulo: string; n: number; nota: string; urgente: boolean; href: string; icone: NomeIcone }[];
  turno: { rotulo: string; pessoas: string[] };
};

const TITULO = "font-numero font-bold tracking-apertada text-texto";

/** Tempo legível: "47 min", "1h42". */
function duracao(min: number) {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

/** Linha de tendência no rodapé do cartão, com a área embaixo bem clara. */
function Tendencia({ serie, forte }: { serie: number[]; forte: boolean }) {
  if (serie.length < 2) return <div className="h-[38px]" />;
  const max = Math.max(...serie);
  const min = Math.min(...serie);
  const faixa = max - min || 1;
  const pts = serie.map((v, i) => `${(i / (serie.length - 1)) * 200},${33 - ((v - min) / faixa) * 27}`);
  const linha = pts.join(" ");
  const cor = forte ? "var(--marca-primaria)" : "color-mix(in srgb, var(--marca-primaria) 50%, var(--painel-cartao))";
  return (
    <svg viewBox="0 0 200 38" preserveAspectRatio="none" className="mt-auto block h-[38px] w-full" aria-hidden>
      <polygon points={`0,38 ${linha} 200,38`} fill="color-mix(in srgb, var(--marca-primaria) 12%, transparent)" />
      <polyline points={linha} fill="none" stroke={cor} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Indicador({ i }: { i: DadosInicio["indicadores"][number] }) {
  let pilula: { texto: string; cls: string } | null = null;
  if (i.chave === "atraso") {
    pilula = Number(i.valor) > 0 ? { texto: "atenção", cls: "pilula pilula-urgente" } : { texto: "em dia", cls: "pilula pilula-ok" };
  } else if (i.variacao != null) {
    pilula = { texto: `${i.variacao >= 0 ? "+" : ""}${i.variacao}%`, cls: i.variacao >= 0 ? "pilula pilula-ok" : "pilula pilula-urgente" };
  } else if (i.diferenca != null) {
    pilula = { texto: `${i.diferenca >= 0 ? "+" : ""}${i.diferenca}`, cls: "pilula" };
  }
  return (
    <div className="cartao flex min-h-[150px] flex-col px-5 pt-[18px]">
      <div className="flex items-center justify-between gap-2">
        <span className="rotulo">{i.rotulo}</span>
        {pilula && <span className={pilula.cls} title="Comparado ao mesmo dia da semana passada">{pilula.texto}</span>}
      </div>
      <p className={`mt-2 text-[34px] leading-[1.1] ${TITULO}`}>{i.valor}</p>
      {/* Quando o número junta coisas diferentes, a divisão fica aqui. */}
      {i.detalhe && i.detalhe.length > 0 ? (
        <div className="mt-auto flex flex-wrap gap-1.5 pb-4">
          {i.detalhe.map((x) => (
            <Link key={x.rotulo} href={x.href} className="pilula pilula-urgente hover:opacity-80">
              {x.n} {x.rotulo}
            </Link>
          ))}
        </div>
      ) : (
        <Tendencia serie={i.serie} forte={i.chave === "faturamento"} />
      )}
    </div>
  );
}

function Busca() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [indo, start] = useTransition();
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (!q.trim()) return;
        start(async () => { const r = await buscarRapido(q); router.push(r.href); });
      }}
      className="flex h-[46px] w-full max-w-[420px] flex-1 items-center gap-2.5 rounded-controle bg-painel-cartao px-4 shadow-controle"
    >
      <Icone nome={indo ? "esperando" : "buscar"} tamanho={18} className={`shrink-0 text-texto-fraco ${indo ? "animate-spin" : ""}`} />
      <label htmlFor="busca-inicio" className="sr-only">Buscar mesa, comanda ou cliente</label>
      <input
        id="busca-inicio"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar mesa, comanda, cliente…"
        className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-texto placeholder:text-texto-fraco"
      />
    </form>
  );
}

const CORES_AVATAR = [
  "bg-[linear-gradient(135deg,color-mix(in_srgb,var(--marca-primaria)_60%,white)_0%,var(--marca-primaria)_100%)] text-marca-escuro",
  "bg-destaque text-texto-marca-pilula",
  "bg-marca-escuro text-painel-foco-rotulo dark:bg-painel-foco-fundo",
];

export function Inicio({ d }: { d: DadosInicio }) {
  const router = useRouter();
  const [grupo, setGrupo] = useState<string | null>(null);
  const gruposVisiveis = grupo ? d.salao.grupos.filter((g) => g.nome === grupo) : d.salao.grupos;

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-[18px] px-4 py-5 md:px-[30px] md:py-[26px]">
      {/* ---------- 1. Topo ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="shrink-0">
          <p className="rotulo">{d.ehHoje ? d.diaLegivel : `${d.diaLegivel} · outro dia`}</p>
          <h1 className={`mt-1 text-[30px] leading-[1.05] ${TITULO}`}>{d.saudacao}, {d.nome}</h1>
        </div>
        <Busca />
        <div className="flex shrink-0 items-center gap-2.5">
          {/* "Ver outro dia": o seletor de data por baixo do botão. */}
          <label className="btn-secundario relative cursor-pointer text-sm">
            {d.ehHoje ? "Ver outro dia" : "Outro dia"}
            <input
              type="date"
              value={d.dia}
              onChange={(e) => router.push(`/dashboard?dia=${e.target.value}`)}
              aria-label="Ver outro dia"
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          {!d.ehHoje && <Link href="/dashboard" className="btn-secundario text-sm">Hoje</Link>}
          <Link href="/pdv" className="btn-principal text-sm">
            <Icone nome="novo" tamanho={16} /> Novo pedido
          </Link>
        </div>
      </div>

      {/* ---------- 2. Indicadores + cartão de foco (caixa) ---------- */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_330px]">
        {d.indicadores.map((i) => <Indicador key={i.chave} i={i} />)}

        <div className="cartao-foco flex min-h-[150px] flex-col px-5 py-[18px]" style={{ "--foco": "var(--painel-foco-texto)" } as React.CSSProperties}>
          <div className="flex items-center justify-between gap-2">
            <span className="rotulo !text-painel-foco-rotulo">Caixa do dia</span>
            <span className="rounded-full bg-painel-foco-texto/10 px-2.5 py-1 text-[11.5px] font-semibold">
              {d.caixa.aberto ? `aberto${d.caixa.desde ? ` às ${d.caixa.desde.replace(":", "h")}` : ""}` : "fechado"}
            </span>
          </div>
          <p className="numero-grande mt-1.5 text-[36px]">{d.caixa.valor}</p>
          <p className="mt-0.5 text-[12.5px] text-painel-foco-suave">
            Pix {d.caixa.pix} · cartão {d.caixa.cartao} · dinheiro {d.caixa.dinheiro}
          </p>
          <div className="mt-auto flex gap-2 pt-3">
            {d.caixa.aberto ? (
              <>
                <Link href="/salao/caixa" className="btn-principal min-h-11 flex-1 text-[13.5px]">Fechar caixa</Link>
                <Link href="/salao/caixa?acao=sangria" className="btn-foco flex-1 text-[13.5px]">Sangria</Link>
              </>
            ) : (
              <Link href="/salao/caixa" className="btn-principal min-h-11 flex-1 text-[13.5px]">Abrir o caixa</Link>
            )}
          </div>
        </div>
      </div>

      {/* ---------- 3. Salão ---------- */}
      <section className="cartao flex flex-col gap-6 px-6 py-5 lg:flex-row lg:gap-9">
        <div className="min-w-0 lg:w-[560px] lg:shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={`text-[19px] ${TITULO}`}>Salão agora</h2>
            {d.salao.grupos.length > 1 && (
              <div className="flex gap-1.5" role="group" aria-label="Filtrar mesas">
                {[null, ...d.salao.grupos.map((g) => g.nome)].map((nome) => {
                  const ativo = grupo === nome;
                  return (
                    <button
                      key={nome ?? "tudo"}
                      type="button"
                      onClick={() => setGrupo(nome)}
                      aria-pressed={ativo}
                      className={`flex min-h-11 items-center rounded-full px-4 text-[13px] ${
                        ativo ? "bg-marca-escuro font-semibold text-painel-foco-texto dark:bg-painel-foco-fundo dark:text-painel-foco-texto" : "bg-painel-fundo text-texto shadow-[inset_0_0_0_1px_var(--borda)]"
                      }`}
                    >
                      {nome ?? "Tudo"}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {gruposVisiveis.map((g) => (
            <div key={g.nome}>
              <p className="rotulo mb-2 mt-4">{g.nome}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.mesas.map((m) => {
                  const cor =
                    m.estado === "ocupada"
                      ? "bg-primaria font-bold text-marca-sobre-primaria shadow-brilho"
                      : m.estado === "conta"
                        ? "bg-painel-cartao font-bold text-texto shadow-[inset_0_0_0_2px_var(--marca-primaria)]"
                        : "bg-superficie-suave text-texto-fraco";
                  const titulo =
                    m.estado === "ocupada"
                      ? `Mesa ${m.numero} — ocupada`
                      : m.estado === "conta"
                        ? `Mesa ${m.numero} — pediu a conta${m.contaPor ? ` (marcou: ${m.contaPor})` : ""}`
                        : `Mesa ${m.numero} — livre`;
                  return (
                    <Link
                      key={m.numero}
                      href={m.comandaId ? `/salao/comandas/${m.comandaId}` : `/salao/mesa/${m.numero}`}
                      title={titulo}
                      aria-label={titulo}
                      className={`flex h-[38px] w-[38px] items-center justify-center rounded-mesa font-numero text-[13px] transition hover:-translate-y-px ${cor}`}
                    >
                      {m.numero}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="grid grid-cols-3 gap-3">
            {[
              { r: "ocupadas", n: d.salao.ocupadas, destaque: true },
              { r: "livres", n: d.salao.livres, destaque: false },
              { r: "conta pedida", n: d.salao.conta, destaque: false },
            ].map((x) => (
              <div key={x.r} className={`rounded-[16px] px-4 py-3.5 ${x.destaque ? "bg-destaque" : "bg-painel-fundo"}`}>
                <p className="numero-grande text-[38px] leading-none text-texto">{x.n}</p>
                <p className={`mt-1.5 text-[13px] ${x.destaque ? "font-semibold text-texto-marca-pilula" : "text-texto-suave"}`}>{x.r}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-texto-suave">
            <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-[5px] bg-primaria" /> Ocupada</span>
            <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-[5px] border-2 border-primaria" /> Conta pedida</span>
            <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-[5px] bg-superficie-suave shadow-[inset_0_0_0_1px_var(--borda)]" /> Livre</span>
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-4">
            <div className="flex items-center gap-3 rounded-controle bg-painel-fundo px-3.5 py-3">
              <Icone nome="relogio" tamanho={18} className="shrink-0 text-texto-marca" />
              {d.salao.maisAntiga ? (
                <Link href={`/salao/comandas/${d.salao.maisAntiga.comandaId}`} className="flex-1 text-[13.5px] text-texto-suave hover:underline">
                  Comanda mais antiga: <span className="font-semibold text-texto">{d.salao.maisAntiga.rotulo}, há {duracao(d.salao.maisAntiga.minutos)}</span>
                </Link>
              ) : (
                <span className="flex-1 text-[13.5px] text-texto-suave">Nenhuma comanda aberta.</span>
              )}
              {d.salao.rodizioDia > 0 && <span className="pilula">rodízio {d.salao.rodizioDia}</span>}
            </div>
            <Link
              href="/salao"
              className="flex min-h-11 items-center justify-center rounded-controle bg-marca-escuro text-sm font-semibold text-painel-foco-texto transition hover:opacity-90 dark:bg-painel-foco-fundo"
            >
              Abrir o salão
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- 4. Rodapé em três cartões ---------- */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr_1fr]">
        <section className="cartao flex flex-col px-5 py-[18px]">
          <div className="flex items-center justify-between">
            <h2 className={`text-[17px] ${TITULO}`}>Delivery</h2>
            <span className={d.delivery.aberto ? "pilula pilula-ok" : "pilula pilula-neutra"}>{d.delivery.aberto ? "aberto" : "fechado"}</span>
          </div>
          <div className="mt-3.5 grid grid-cols-3 gap-2">
            {[
              { r: "na cozinha", n: d.delivery.cozinha, destaque: true },
              { r: "na rua", n: d.delivery.rua, destaque: false },
              { r: "entregues", n: d.delivery.entregues, destaque: false },
            ].map((x) => (
              <div key={x.r} className={`rounded-controle px-3 py-2.5 ${x.destaque ? "bg-destaque" : "bg-painel-fundo"}`}>
                <p className="numero-grande text-2xl leading-none text-texto">{x.n}</p>
                <p className={`mt-1 text-xs ${x.destaque ? "font-semibold text-texto-marca-pilula" : "text-texto-suave"}`}>{x.r}</p>
              </div>
            ))}
          </div>
          <div className="mt-auto flex items-center justify-between pt-4">
            <span className="text-[13px] text-texto-suave">
              Tempo médio <span className="font-semibold text-texto">{d.delivery.tempoMedio == null ? "—" : `${d.delivery.tempoMedio} min`}</span>
            </span>
            <Link href="/delivery" className="text-[13px] font-bold text-texto-marca hover:underline">Ver pedidos</Link>
          </div>
        </section>

        <section className="cartao flex flex-col px-5 py-[18px]">
          <div className="flex items-center justify-between">
            <h2 className={`text-[17px] ${TITULO}`}>Precisa de você</h2>
            {d.pendencias.length > 0 && <span className="pilula pilula-urgente-solido">{d.pendencias.length}</span>}
          </div>
          {d.pendencias.length === 0 ? (
            <p className="mt-3 text-sm text-texto-suave">Nada esperando por você agora.</p>
          ) : (
            <div className="mt-2 flex flex-col">
              {d.pendencias.map((p) => (
                <Link
                  key={p.rotulo}
                  href={p.href}
                  className="flex min-h-11 items-center gap-3 border-b border-borda py-2 text-texto last:border-0 hover:opacity-80"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${p.urgente ? "bg-urgente-solido" : "bg-primaria"}`} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{p.rotulo}</span>
                  <span className={p.urgente ? "pilula pilula-urgente" : "pilula"}>{p.nota}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="cartao flex flex-col px-5 py-[18px]">
          <h2 className={`text-[17px] ${TITULO}`}>Na casa agora</h2>
          {d.turno.pessoas.length === 0 ? (
            <p className="mt-3 text-sm text-texto-suave">Ninguém marcado no turno {d.turno.rotulo === "noite" ? "da noite" : "do dia"}.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2.5">
              {d.turno.pessoas.map((p, i) => (
                <div key={p} className="flex w-12 flex-col items-center gap-1.5">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full text-[12.5px] font-bold ${CORES_AVATAR[i % CORES_AVATAR.length]}`}>
                    {p.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="w-full truncate text-center text-xs text-texto-suave">{p}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto flex items-center justify-between pt-4">
            <span className="text-[13px] text-texto-suave">
              {d.turno.pessoas.length} {d.turno.pessoas.length === 1 ? "pessoa" : "pessoas"} no turno {d.turno.rotulo === "noite" ? "da noite" : "do dia"}
            </span>
            <Link href="/colaboradores/semana" className="text-[13px] font-bold text-texto-marca hover:underline">Escala</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
