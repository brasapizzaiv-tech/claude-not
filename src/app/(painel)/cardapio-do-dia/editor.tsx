"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import { apagarCardapio, despublicarCardapio, salvarCardapio } from "./actions";

export type Cardapio = {
  data: string;
  proteinas: string | null;
  carboidratos: string | null;
  especial: string | null;
  preco_livre: number | null;
  preco_kg: number | null;
  publicado: boolean;
};

const SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
// Preços do buffet por dia da semana (os mesmos da tabela de valores do site).
const PRECOS: Record<number, { livre: number; kg: number }> = {
  1: { livre: 40.9, kg: 94.9 },
  2: { livre: 40.9, kg: 94.9 },
  3: { livre: 40.9, kg: 94.9 },
  4: { livre: 40.9, kg: 94.9 },
  5: { livre: 45.9, kg: 99.9 },
  6: { livre: 67.9, kg: 149.9 },
};

const campo =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const rotulo = "mb-1 block text-xs font-medium text-orange-600";
const btn =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";

function addDias(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
function diaSemanaN(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}
const moeda = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (s: string) => {
  const t = s.trim();
  if (!t) return null;
  return Number(t.replace(/\./g, "").replace(",", ".")) || null;
};
const texto = (n: number | null) =>
  n == null ? "" : String(n.toFixed(2)).replace(".", ",");

export function EditorCardapio({
  dia,
  hoje,
  dias,
  atual,
}: {
  dia: string;
  hoje: string;
  dias: Cardapio[];
  atual: Cardapio | null;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const dow = diaSemanaN(dia);
  const sugerido = PRECOS[dow];

  const [d, setD] = useState({
    proteinas: atual?.proteinas ?? "",
    carboidratos: atual?.carboidratos ?? "",
    especial: atual?.especial ?? "",
    preco_livre: texto(atual?.preco_livre ?? sugerido?.livre ?? null),
    preco_kg: texto(atual?.preco_kg ?? sugerido?.kg ?? null),
  });

  const set = (k: string, v: string) => setD((s) => ({ ...s, [k]: v }));
  const irPara = (v: string) => router.push(`/cardapio-do-dia?dia=${v}`);
  const domingo = dow === 0;

  function salvar(publicar: boolean) {
    setMsg(null);
    start(async () => {
      const r = await salvarCardapio(
        dia,
        {
          proteinas: d.proteinas,
          carboidratos: d.carboidratos,
          especial: d.especial,
          preco_livre: numero(d.preco_livre),
          preco_kg: numero(d.preco_kg),
        },
        publicar,
      );
      setMsg(
        r.ok
          ? publicar
            ? "✓ Publicado — já está no site."
            : "✓ Salvo como rascunho (não aparece no site)."
          : (r.erro ?? "Não salvou."),
      );
      router.refresh();
    });
  }

  // Copia o cardápio de um dia anterior já preenchido (mesmo dia da semana
  // primeiro, senão o último preenchido antes deste).
  function copiarDe(origem: Cardapio) {
    const p = PRECOS[diaSemanaN(dia)];
    setD({
      proteinas: origem.proteinas ?? "",
      carboidratos: origem.carboidratos ?? "",
      especial: origem.especial ?? "",
      preco_livre: texto(p?.livre ?? origem.preco_livre ?? null),
      preco_kg: texto(p?.kg ?? origem.preco_kg ?? null),
    });
    setMsg("Copiado de " + dataBR(origem.data) + " — confira e publique.");
  }
  const paraCopiar = dias
    .filter((c) => c.data < dia && (c.proteinas || c.carboidratos))
    .sort((a, b) => (a.data < b.data ? 1 : -1));
  const mesmoDiaSemana = paraCopiar.find(
    (c) => diaSemanaN(c.data) === dow,
  );

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Cardápio do dia
      </h1>
      <p className="mt-1 text-zinc-500">
        O que você publicar aqui aparece no site, em{" "}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          brasarestaurante.com.br/cardapio
        </span>{" "}
        — é esse link que dá pra mandar pra quem pedir o cardápio.
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <div>
          {/* Dia */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button onClick={() => irPara(addDias(dia, -1))} className={btn}>
              ←
            </button>
            <input
              type="date"
              value={dia}
              onChange={(e) => e.target.value && irPara(e.target.value)}
              className={campo}
            />
            <button onClick={() => irPara(addDias(dia, 1))} className={btn}>
              →
            </button>
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {SEMANA[dow]}
              {dia === hoje ? " · hoje" : ""}
            </span>
            {atual?.publicado ? (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                no ar
              </span>
            ) : atual ? (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800">
                rascunho
              </span>
            ) : null}
          </div>

          {domingo && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              Domingo a casa não abre — normalmente não precisa de cardápio.
            </p>
          )}

          {/* Atalhos de cópia */}
          {(mesmoDiaSemana || paraCopiar[0]) && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>Começar a partir de:</span>
              {mesmoDiaSemana && (
                <button onClick={() => copiarDe(mesmoDiaSemana)} className={btn}>
                  {SEMANA[dow]} passada ({dataBR(mesmoDiaSemana.data)})
                </button>
              )}
              {paraCopiar[0] && paraCopiar[0] !== mesmoDiaSemana && (
                <button onClick={() => copiarDe(paraCopiar[0])} className={btn}>
                  último preenchido ({dataBR(paraCopiar[0].data)})
                </button>
              )}
            </div>
          )}

          {/* Campos */}
          <div className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <label className={rotulo}>PROTEÍNAS</label>
              <textarea
                rows={6}
                value={d.proteinas}
                onChange={(e) => set("proteinas", e.target.value)}
                placeholder={"Molho bolonhesa\nFrango acebolado\nSuíno alho e óleo"}
                className={`${campo} w-full`}
              />
            </div>
            <div>
              <label className={rotulo}>CARBOIDRATOS</label>
              <textarea
                rows={10}
                value={d.carboidratos}
                onChange={(e) => set("carboidratos", e.target.value)}
                placeholder={"Arroz branco\nFeijão\nMassa caseira"}
                className={`${campo} w-full`}
              />
            </div>
            <div>
              <label className={rotulo}>ESPECIAL DO DIA</label>
              <textarea
                rows={2}
                value={d.especial}
                onChange={(e) => set("especial", e.target.value)}
                placeholder="Pastel de chocolate"
                className={`${campo} w-full`}
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              Um item por linha — é assim que eles aparecem na lista do site.
            </p>

            <div className="flex flex-wrap gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <div>
                <label className={rotulo}>LIVRE (R$)</label>
                <input
                  inputMode="decimal"
                  value={d.preco_livre}
                  onChange={(e) => set("preco_livre", e.target.value)}
                  className={`${campo} w-28 text-right`}
                />
              </div>
              <div>
                <label className={rotulo}>KG (R$)</label>
                <input
                  inputMode="decimal"
                  value={d.preco_kg}
                  onChange={(e) => set("preco_kg", e.target.value)}
                  className={`${campo} w-28 text-right`}
                />
              </div>
              <p className="self-end pb-2 text-[11px] text-zinc-400">
                Já vêm preenchidos pelo dia da semana ({moeda(sugerido?.livre ?? null)}{" "}
                e {moeda(sugerido?.kg ?? null)}). Mude se o dia for diferente.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <button
                disabled={proc}
                onClick={() => salvar(true)}
                className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {proc ? "Salvando..." : atual?.publicado ? "Salvar e manter no ar" : "Publicar no site"}
              </button>
              <button disabled={proc} onClick={() => salvar(false)} className={btn}>
                Salvar rascunho
              </button>
              {atual?.publicado && (
                <button
                  disabled={proc}
                  onClick={() =>
                    start(async () => {
                      await despublicarCardapio(dia);
                      setMsg("Tirado do ar.");
                      router.refresh();
                    })
                  }
                  className={btn}
                >
                  Tirar do ar
                </button>
              )}
              {atual && (
                <button
                  disabled={proc}
                  onClick={() => {
                    if (confirm(`Apagar o cardápio de ${dataBR(dia)}?`))
                      start(async () => {
                        await apagarCardapio(dia);
                        setMsg("Apagado.");
                        router.refresh();
                      });
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-red-600"
                >
                  Apagar
                </button>
              )}
            </div>
            {msg && <p className="text-xs text-zinc-600 dark:text-zinc-300">{msg}</p>}
          </div>
        </div>

        {/* Próximos dias + prévia */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Próximos dias
            </h2>
            <div className="space-y-1">
              {Array.from({ length: 14 }, (_, i) => addDias(hoje, i))
                .filter((v) => diaSemanaN(v) !== 0)
                .map((v) => {
                  const c = dias.find((x) => x.data === v);
                  const sel = v === dia;
                  return (
                    <button
                      key={v}
                      onClick={() => irPara(v)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
                        sel
                          ? "bg-orange-50 dark:bg-orange-950/30"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {SEMANA[diaSemanaN(v)].slice(0, 3)}, {dataBR(v).slice(0, 5)}
                        {v === hoje ? " · hoje" : ""}
                      </span>
                      <span
                        className={
                          c?.publicado
                            ? "font-medium text-green-600"
                            : c
                              ? "text-zinc-400"
                              : "text-zinc-300 dark:text-zinc-600"
                        }
                      >
                        {c?.publicado ? "no ar" : c ? "rascunho" : "vazio"}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Prévia igual à do site */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <div className="bg-[#211915] p-5 text-[#E8DED5]">
              <p className="text-center text-[11px] uppercase tracking-[.2em] text-[#C78340]">
                Cardápio
              </p>
              <p className="mb-4 text-center text-lg font-bold uppercase text-white">
                {SEMANA[dow]}
              </p>
              {(
                [
                  ["Proteínas", d.proteinas],
                  ["Carboidratos", d.carboidratos],
                  ["Especial do dia", d.especial],
                ] as const
              ).map(([titulo, valor]) =>
                valor.trim() ? (
                  <div key={titulo} className="mb-3">
                    <span className="inline-block bg-[#C78340] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#211915]">
                      {titulo}
                    </span>
                    <ul className="mt-1.5 space-y-0.5 text-sm">
                      {valor
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean)
                        .map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                    </ul>
                  </div>
                ) : null,
              )}
              <div className="mt-4 flex justify-center gap-3">
                <span className="rounded-lg bg-[#C78340] px-4 py-1.5 text-center text-[#211915]">
                  <b className="block text-[10px] uppercase tracking-wider">Livre</b>
                  <b className="text-sm">{moeda(numero(d.preco_livre))}</b>
                </span>
                <span className="rounded-lg bg-[#C78340] px-4 py-1.5 text-center text-[#211915]">
                  <b className="block text-[10px] uppercase tracking-wider">KG</b>
                  <b className="text-sm">{moeda(numero(d.preco_kg))}</b>
                </span>
              </div>
            </div>
            <p className="bg-zinc-50 px-3 py-2 text-[11px] text-zinc-400 dark:bg-zinc-900">
              Prévia de como fica no site.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
