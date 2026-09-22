"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icone } from "@/components/icone";
import { GRUPOS, DIAS, TURNO } from "@/lib/folgas";

export type FolgaMural = {
  id: number;
  nome: string;
  grupo: string;
  gerente: boolean;
  data: string;
  motivo: string | null;
  status: "Pendente" | "Aprovado" | "Negado";
  origem: string;
  criadoEm: string | null;
};

export type PedidoCompraMural = {
  id: number;
  nome: string;
  item: string;
  quantidade: string | null;
  motivo: string | null;
  urgente: boolean;
  status: string;
  tipo: string;
  criadoEm: string | null;
  respondidoEm: string | null;
};

const CARTAO = "h-fit rounded-cartao bg-painel-cartao p-4";
const ROTULO = "text-xs font-medium text-texto-fraco";

/** Quantos dias entre duas datas em AAAA-MM-DD, sem passar por fuso. */
function dias(de: string, ate: string) {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((+new Date(a2, m2 - 1, d2) - +new Date(a1, m1 - 1, d1)) / 86400000);
}

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "hoje", "ontem", "há 3 dias" — quando o assunto é espera, a distância diz
 *  mais que a data. */
function espera(iso: string | null, hoje: string) {
  if (!iso) return "";
  const n = dias(iso.slice(0, 10), hoje);
  if (n <= 0) return "hoje";
  if (n === 1) return "ontem";
  return `há ${n} dias`;
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

function nomeGrupo(g: string) {
  return (GRUPOS as Record<string, { nome: string; cor: string } | undefined>)[g];
}

// Esta é a tela do PAINEL, com login. A TV do escritório tem a sua própria
// versão em src/app/tv/mural/mural-tv.tsx — o navegador de TV não roda o CSS
// em que esta aqui é escrita. Os dois leem os mesmos números, de
// src/lib/mural-server.ts.
export function Mural({
  folgas,
  solicitacoes,
  hoje,
}: {
  folgas: FolgaMural[];
  solicitacoes: PedidoCompraMural[];
  hoje: string;
}) {
  const router = useRouter();
  const [atualizadoEm, setAtualizadoEm] = useState<string>("");

  // A tela costuma ficar aberta o dia inteiro num canto: ela mesma se atualiza.
  // Um minuto é o suficiente — folga e pedido de compra não chegam aos montes,
  // e recarregar de 5 em 5 segundos só gastaria banco à toa.
  useEffect(() => {
    const marcar = () =>
      setAtualizadoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    marcar();
    const t = setInterval(() => {
      router.refresh();
      marcar();
    }, 60_000);
    return () => clearInterval(t);
  }, [router]);

  const pendentes = useMemo(() => folgas.filter((f) => f.status === "Pendente"), [folgas]);
  const aprovadas = useMemo(
    () => folgas.filter((f) => f.status === "Aprovado" && f.data >= hoje),
    [folgas, hoje],
  );
  const comprasAbertas = useMemo(
    () => solicitacoes.filter((s) => s.status === "pendente"),
    [solicitacoes],
  );
  const comprasResolvidas = useMemo(
    () => solicitacoes.filter((s) => s.status !== "pendente").slice(0, 6),
    [solicitacoes],
  );

  // Folgas aprovadas agrupadas por dia, que é como se lê uma escala.
  const porDia = useMemo(() => {
    const m = new Map<string, FolgaMural[]>();
    for (const f of aprovadas) {
      const a = m.get(f.data) ?? [];
      a.push(f);
      m.set(f.data, a);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [aprovadas]);

  const esperando = pendentes.length + comprasAbertas.length;
  // O cartão mostra no máximo 6 de cada lado; o resto vira uma linha só.
  const mostrados = Math.min(pendentes.length, 6) + Math.min(comprasAbertas.length, 6);

  return (
    <div className="flex w-full flex-col gap-4 p-5">
      {/* ---------- Cabeçalho ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
            Mural do escritório
          </h1>
          <p className="mt-0.5 text-sm text-texto-suave">
            O que a equipe pediu e está esperando resposta.
          </p>
        </div>
        <span className="text-xs text-texto-fraco">
          atualiza sozinho · {atualizadoEm || "—"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* ---------- 1. Esperando você ---------- */}
        {/* O cartão invertido, como na tela inicial: uma chamada por tela, e
            aqui ela é esta — é o motivo de o mural existir. */}
        <section className="h-fit rounded-cartao bg-painel-foco-fundo p-4 text-painel-foco-texto lg:col-span-4">
          <p className="text-xs font-medium opacity-70">Esperando você</p>
          <p className="mt-1 font-numero text-4xl font-semibold tracking-apertada">{esperando}</p>
          <p className="mt-0.5 text-xs opacity-70">
            {plural(pendentes.length, "pedido de folga", "pedidos de folga")} ·{" "}
            {plural(comprasAbertas.length, "pedido de compra", "pedidos de compra")}
          </p>

          {esperando === 0 ? (
            <p className="mt-5 text-sm opacity-80">
              Nada esperando resposta. Quando alguém pedir, aparece aqui.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {pendentes.slice(0, 6).map((f) => (
                <Link
                  key={`f${f.id}`}
                  href="/folgas"
                  className="rounded-controle bg-painel-foco-texto/10 px-3 py-2 transition hover:bg-painel-foco-texto/20"
                >
                  <p className="text-sm font-semibold">
                    {f.nome} <span className="font-normal opacity-70">quer folga</span>
                  </p>
                  <p className="text-xs opacity-80">
                    {DIAS[new Date(`${f.data}T12:00:00`).getDay()]}, {dataCurta(f.data)}
                    {f.criadoEm ? ` · pediu ${espera(f.criadoEm, hoje)}` : ""}
                  </p>
                  {f.motivo && <p className="mt-0.5 text-xs opacity-70">{f.motivo}</p>}
                </Link>
              ))}
              {comprasAbertas.slice(0, 6).map((s) => (
                <Link
                  key={`c${s.id}`}
                  href="/solicitacoes"
                  className="rounded-controle bg-painel-foco-texto/10 px-3 py-2 transition hover:bg-painel-foco-texto/20"
                >
                  <p className="text-sm font-semibold">
                    {s.item}
                    {s.urgente && (
                      <span className="ml-2 rounded bg-painel-foco-texto/25 px-1.5 py-0.5 text-mini font-bold uppercase">
                        urgente
                      </span>
                    )}
                  </p>
                  <p className="text-xs opacity-80">
                    {s.nome}
                    {s.quantidade ? ` · ${s.quantidade}` : ""}
                    {s.criadoEm ? ` · pediu ${espera(s.criadoEm, hoje)}` : ""}
                  </p>
                </Link>
              ))}
              {esperando > mostrados && (
                <p className="text-xs opacity-70">e mais {esperando - mostrados}…</p>
              )}
            </div>
          )}
        </section>

        {/* ---------- 2. Folgas que vêm aí ---------- */}
        <section className={`${CARTAO} lg:col-span-5`}>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <p className={ROTULO}>Folgas aprovadas · próximos 45 dias</p>
            <Link href="/folgas" className="text-xs text-texto-suave hover:underline">
              gerir →
            </Link>
          </div>
          {porDia.length === 0 ? (
            <p className="text-sm text-texto-fraco">Nenhuma folga marcada pra frente.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {porDia.slice(0, 14).map(([data, lista]) => {
                const falta = dias(hoje, data);
                const temGerente = lista.some((f) => f.gerente);
                return (
                  <li
                    key={data}
                    className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-b border-borda pb-2 last:border-0 sm:grid-cols-[6rem_4.5rem_minmax(0,1fr)]"
                  >
                    <span className="font-numero text-sm font-semibold tracking-apertada text-texto">
                      {DIAS[new Date(`${data}T12:00:00`).getDay()]}, {dataCurta(data)}
                    </span>
                    <span className="hidden text-xs text-texto-fraco sm:block">
                      {falta === 0 ? "hoje" : falta === 1 ? "amanhã" : `em ${falta} dias`}
                    </span>
                    <span className="flex flex-wrap items-baseline gap-1.5">
                      {lista.map((f) => {
                        const g = nomeGrupo(f.grupo);
                        return (
                          <span
                            key={f.id}
                            className="whitespace-nowrap rounded-controle bg-superficie-suave px-2 py-0.5 text-xs text-texto-suave"
                            title={g ? `${g.nome}${TURNO[f.grupo] ? ` · ${TURNO[f.grupo]}` : ""}` : undefined}
                          >
                            <span style={g ? { color: g.cor } : undefined}>●</span>{" "}
                            {f.nome.split(" ")[0]}
                            {f.gerente ? " (ger.)" : ""}
                          </span>
                        );
                      })}
                      {/* Dia com gerente de folga é o que costuma dar
                          problema: a casa pode ficar sem ninguém pra decidir.
                          Fica junto dos nomes, não numa linha à parte, senão
                          parece o aviso do dia de baixo. */}
                      {temGerente && (
                        <span className="whitespace-nowrap text-xs font-semibold text-amber-600 dark:text-amber-400">
                          sem gerente
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
              {porDia.length > 14 && (
                <li className="text-xs text-texto-fraco">
                  e mais {plural(porDia.length - 14, "dia", "dias")} com folga marcada
                </li>
              )}
            </ul>
          )}
        </section>

        {/* ---------- 3. Pedidos de compra ---------- */}
        <section className={`${CARTAO} lg:col-span-3`}>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <p className={ROTULO}>Pedidos da equipe</p>
            <Link href="/solicitacoes" className="text-xs text-texto-suave hover:underline">
              ver →
            </Link>
          </div>
          {comprasAbertas.length === 0 && comprasResolvidas.length === 0 ? (
            <p className="text-sm text-texto-fraco">Ninguém pediu nada ainda.</p>
          ) : (
            <>
              {comprasAbertas.length === 0 && (
                <p className="mb-4 text-sm text-texto-fraco">Nenhum pedido esperando resposta.</p>
              )}
              {comprasAbertas.length > 0 && (
                <ul className="mb-4 flex flex-col gap-2">
                  {comprasAbertas.map((s) => (
                    <li key={s.id} className="rounded-controle bg-superficie-suave px-3 py-2">
                      <p className="text-sm font-semibold text-texto">
                        {s.item}
                        {s.urgente && (
                          <span className="ml-2 text-mini font-bold text-red-600 dark:text-red-400">
                            URGENTE
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-texto-suave">
                        {s.nome}
                        {s.quantidade ? ` · ${s.quantidade}` : ""}
                        {s.tipo === "manutencao" ? " · manutenção" : ""}
                      </p>
                      {s.motivo && <p className="text-mini text-texto-fraco">{s.motivo}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {comprasResolvidas.length > 0 && (
                <>
                  <p className={`${ROTULO} mb-1.5`}>Já resolvidos</p>
                  <ul className="flex flex-col gap-1">
                    {comprasResolvidas.map((s) => (
                      <li key={s.id} className="flex items-baseline gap-2 text-xs">
                        <Icone
                          nome={s.status === "rejeitado" ? "errado" : "certo"}
                          tamanho={12}
                          className={
                            s.status === "rejeitado"
                              ? "text-red-600 dark:text-red-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }
                        />
                        <span className="flex-1 text-texto-suave">{s.item}</span>
                        <span className="text-texto-fraco">{s.nome.split(" ")[0]}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
