"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icone, type NomeIcone } from "@/components/icone";

// Tela inicial do painel (Etapa 4 do design).
//
// Só desenho: os dados chegam prontos de page.tsx. É o que permite conferir a
// tela sem precisar do banco, e o que deixa a página do servidor enxuta.
//
// A regra de cor: o laranja da marca aparece em UM lugar só nesta tela, que é o
// mapa do salão. Ele é o assunto aqui. Todo o resto é neutro, senão nada se
// destaca. O cartão de foco chama atenção invertendo o fundo, não colorindo.

export type Mesa = {
  numero: number;
  estado: "livre" | "ocupada" | "conta";
  comandaId: string | null;
  contaPor: string | null;
};

export type DadosInicio = {
  nome: string;
  dia: string;        // AAAA-MM-DD
  diaLegivel: string; // "sexta, 19 de setembro"
  ehHoje: boolean;
  indicadores: {
    chave: string;
    rotulo: string;
    valor: string;
    variacao: number | null;
    serie: number[];
    detalhe?: { rotulo: string; n: number; href: string }[];
  }[];
  caixa: { aberto: boolean; valor: string; desde: string | null };
  salao: {
    grupos: { nome: string; mesas: Mesa[] }[];
    ocupadas: number;
    livres: number;
    conta: number;
    maisAntiga: { numero: number; minutos: number; comandaId: string } | null;
    rodizioDia: number;
  };
  delivery: { cozinha: number; rua: number; entregues: number; tempoMedio: number | null };
  pendencias: { rotulo: string; n: number; href: string; icone: NomeIcone }[];
  turno: { rotulo: string; pessoas: string[] };
};

const CARTAO = "rounded-cartao bg-painel-cartao p-4";
const ROTULO = "text-xs font-medium text-texto-fraco";
const NUMERO = "font-numero tracking-apertada text-texto";

/** Linha de tendência do rodapé do cartão. Discreta de propósito: serve pra
 *  dar o sentido do movimento, não pra ler valor. */
function Tendencia({ serie }: { serie: number[] }) {
  if (serie.length < 2) return <div className="h-8" />;
  const max = Math.max(...serie);
  const min = Math.min(...serie);
  const faixa = max - min || 1;
  const pontos = serie
    .map((v, i) => `${(i / (serie.length - 1)) * 100},${28 - ((v - min) / faixa) * 24}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-3 h-8 w-full" aria-hidden>
      <polyline points={pontos} fill="none" stroke="currentColor" strokeWidth="1.5"
        vectorEffect="non-scaling-stroke" className="text-borda-forte" />
    </svg>
  );
}

/** Etiqueta de variação contra o mesmo dia da semana anterior. */
function Variacao({ pct }: { pct: number | null }) {
  if (pct == null) return <span className={ROTULO}>sem comparação</span>;
  const subiu = pct >= 0;
  return (
    <span className="inline-flex items-center gap-1 rounded-controle bg-superficie-suave px-1.5 py-0.5 text-xs font-medium text-texto-suave">
      <Icone nome={subiu ? "subindo" : "descendo"} tamanho={12} />
      {subiu ? "+" : ""}{pct}%
    </span>
  );
}

export function Inicio({ d }: { d: DadosInicio }) {
  const router = useRouter();

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-5">
      {/* ---------- 1. Saudação ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-semibold ${NUMERO}`}>Olá, {d.nome}</h1>
          <p className="mt-0.5 text-sm text-texto-suave">
            {d.ehHoje ? "Hoje, " : ""}{d.diaLegivel}
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-controle bg-painel-cartao px-3 py-2 text-sm text-texto-suave">
          <Icone nome="agenda" tamanho={16} />
          <span className="sr-only">Ver outro dia</span>
          <input
            type="date"
            value={d.dia}
            onChange={(e) => router.push(`/dashboard?dia=${e.target.value}`)}
            className="bg-transparent font-numero text-texto outline-none"
          />
        </label>
      </div>

      {/* ---------- 2. Indicadores + 3. Cartão de foco ---------- */}
      <div className="grid gap-4 lg:grid-cols-12">
        {d.indicadores.map((i) => (
          <div key={i.chave} className={`${CARTAO} lg:col-span-3`}>
            <div className="flex items-center justify-between gap-2">
              <p className={ROTULO}>{i.rotulo}</p>
              <Variacao pct={i.variacao} />
            </div>
            <p className={`mt-2 text-3xl font-semibold ${NUMERO}`}>{i.valor}</p>
            {/* Quando o número junta coisas diferentes, a divisão fica aqui —
                senão não dá pra saber o que está atrasado sem clicar. */}
            {i.detalhe && i.detalhe.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {i.detalhe.map((x) => (
                  <Link key={x.rotulo} href={x.href} className="text-xs text-texto-suave hover:text-texto hover:underline">
                    {x.n} {x.rotulo}
                  </Link>
                ))}
              </div>
            )}
            <Tendencia serie={i.serie} />
          </div>
        ))}

        {/* O cartão de foco: invertido em relação ao fundo. Uma por tela. */}
        <div className="rounded-cartao bg-painel-foco-fundo p-4 text-painel-foco-texto lg:col-span-3">
          <p className="text-xs font-medium opacity-70">Caixa do dia</p>
          <p className={`mt-2 text-3xl font-semibold font-numero tracking-apertada`}>{d.caixa.valor}</p>
          <p className="mt-0.5 text-xs opacity-70">
            {d.caixa.aberto ? `aberto${d.caixa.desde ? ` desde ${d.caixa.desde}` : ""}` : "fechado"}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/pdv"
              className="flex min-h-11 items-center justify-center gap-2 rounded-controle bg-painel-foco-texto px-3 text-sm font-semibold text-painel-foco-fundo transition hover:opacity-90"
            >
              <Icone nome="novo" tamanho={16} /> Novo pedido
            </Link>
            <Link
              href="/salao/caixa"
              className="flex min-h-11 items-center justify-center gap-2 rounded-controle border border-current/30 px-3 text-sm font-medium transition hover:bg-painel-foco-texto/10"
            >
              <Icone nome="cadeado" tamanho={16} /> Fechar caixa
            </Link>
          </div>
        </div>
      </div>

      {/* ---------- 4. Mapa do salão ---------- */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className={`${CARTAO} lg:col-span-8`}>
          <p className={`${ROTULO} mb-3`}>Mapa do salão</p>
          <div className="flex flex-col gap-4">
            {d.salao.grupos.map((g) => (
              <div key={g.nome}>
                <p className="mb-2 text-xs font-semibold text-texto-suave">{g.nome}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.mesas.map((m) => {
                    const base =
                      "flex h-11 w-11 items-center justify-center rounded-controle font-numero text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria";
                    const cor =
                      m.estado === "ocupada"
                        ? "bg-primaria text-marca-sobre-primaria"
                        : m.estado === "conta"
                          ? "border-2 border-primaria bg-transparent text-primaria font-semibold"
                          : "border border-borda bg-painel-fundo text-texto-suave";
                    const titulo =
                      m.estado === "ocupada"
                        ? `Mesa ${m.numero} — ocupada`
                        : m.estado === "conta"
                          ? `Mesa ${m.numero} — pediu a conta${m.contaPor ? ` (marcou: ${m.contaPor})` : ""}`
                          : `Mesa ${m.numero} — livre`;
                    return m.comandaId ? (
                      <Link key={m.numero} href={`/salao/comandas/${m.comandaId}`} title={titulo} aria-label={titulo} className={`${base}  ${cor}`}>
                        {m.numero}
                      </Link>
                    ) : (
                      <Link key={m.numero} href={`/salao/mesa/${m.numero}`} title={titulo} aria-label={titulo} className={`${base}  ${cor}`}>
                        {m.numero}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${CARTAO} lg:col-span-4`}>
          <div className="grid grid-cols-3 gap-2">
            {[
              { r: "Ocupadas", n: d.salao.ocupadas },
              { r: "Livres", n: d.salao.livres },
              { r: "Conta pedida", n: d.salao.conta },
            ].map((x) => (
              <div key={x.r}>
                <p className={`text-3xl font-semibold ${NUMERO}`}>{x.n}</p>
                <p className={ROTULO}>{x.r}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-1.5 border-t border-borda pt-3 text-xs text-texto-suave">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-[3px] bg-primaria" /> ocupada
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-[3px] border-2 border-primaria" /> pediu a conta
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-[3px] border border-borda bg-painel-fundo" /> livre
            </span>
          </div>

          <div className="mt-4 border-t border-borda pt-3">
            <p className={ROTULO}>Aberta há mais tempo</p>
            {d.salao.maisAntiga ? (
              <Link href={`/salao/comandas/${d.salao.maisAntiga.comandaId}`} className="mt-1 block hover:underline">
                <span className={`text-lg font-semibold ${NUMERO}`}>Mesa {d.salao.maisAntiga.numero}</span>
                <span className="ml-2 text-sm text-texto-suave">há {d.salao.maisAntiga.minutos} min</span>
              </Link>
            ) : (
              <p className="mt-1 text-sm text-texto-fraco">nenhuma comanda aberta</p>
            )}
          </div>

          <div className="mt-3 border-t border-borda pt-3">
            <p className={ROTULO}>Rodízio no dia</p>
            <p className={`mt-1 text-lg font-semibold ${NUMERO}`}>
              {d.salao.rodizioDia} <span className="text-sm font-normal text-texto-suave">pedidos de sabor</span>
            </p>
          </div>
        </div>
      </div>

      {/* ---------- 5. Rodapé em três cartões ---------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={CARTAO}>
          <p className={`${ROTULO} mb-3`}>Delivery</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { r: "Na cozinha", n: String(d.delivery.cozinha) },
              { r: "Na rua", n: String(d.delivery.rua) },
              { r: "Entregues", n: String(d.delivery.entregues) },
              { r: "Tempo médio", n: d.delivery.tempoMedio == null ? "—" : `${d.delivery.tempoMedio}m` },
            ].map((x) => (
              <div key={x.r}>
                <p className={`text-xl font-semibold ${NUMERO}`}>{x.n}</p>
                <p className="text-[11px] text-texto-fraco">{x.r}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={CARTAO}>
          <p className={`${ROTULO} mb-3`}>Precisa de você</p>
          {d.pendencias.length === 0 ? (
            <p className="text-sm text-texto-fraco">Nada esperando. Bom trabalho.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {d.pendencias.map((p) => (
                <Link
                  key={p.rotulo}
                  href={p.href}
                  className="flex min-h-11 items-center gap-2.5 rounded-controle px-2 text-sm text-texto-suave transition hover:bg-superficie-suave hover:text-texto"
                >
                  <Icone nome={p.icone} tamanho={16} />
                  <span className="flex-1">{p.rotulo}</span>
                  <span className={`font-semibold ${NUMERO}`}>{p.n}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className={CARTAO}>
          <p className={`${ROTULO} mb-3`}>Na casa {d.turno.rotulo}</p>
          {d.turno.pessoas.length === 0 ? (
            <p className="text-sm text-texto-fraco">Ninguém marcado neste turno.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {d.turno.pessoas.map((p) => (
                <span key={p} className="rounded-controle bg-superficie-suave px-2 py-1 text-sm text-texto-suave">
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
