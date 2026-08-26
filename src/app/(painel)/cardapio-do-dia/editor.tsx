"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import {
  apagarCardapio,
  apagarItem,
  criarItens,
  despublicarCardapio,
  salvarCardapio,
  type Grupo,
} from "./actions";

export type Cardapio = {
  data: string;
  proteinas: string | null;
  carboidratos: string | null;
  especial: string | null;
  preco_livre: number | null;
  preco_kg: number | null;
  publicado: boolean;
};
export type ItemCat = { id: string; grupo: string; nome: string; usos: number };

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
const BLOCOS: { grupo: Grupo; titulo: string }[] = [
  { grupo: "proteinas", titulo: "Proteínas" },
  { grupo: "carboidratos", titulo: "Carboidratos" },
  { grupo: "especial", titulo: "Especial do dia" },
];

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
// Busca sem acento e sem caixa: "sui" acha "Suíno".
const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const paraLinhas = (t: string | null) =>
  (t ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function EditorCardapio({
  dia,
  hoje,
  dias,
  atual,
  itens,
}: {
  dia: string;
  hoje: string;
  dias: Cardapio[];
  atual: Cardapio | null;
  itens: ItemCat[];
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const dow = diaSemanaN(dia);
  const sugerido = PRECOS[dow];

  const [sel, setSel] = useState<Record<Grupo, string[]>>({
    proteinas: paraLinhas(atual?.proteinas ?? null),
    carboidratos: paraLinhas(atual?.carboidratos ?? null),
    especial: paraLinhas(atual?.especial ?? null),
  });
  const [precos, setPrecos] = useState({
    livre: texto(atual?.preco_livre ?? sugerido?.livre ?? null),
    kg: texto(atual?.preco_kg ?? sugerido?.kg ?? null),
  });

  const irPara = (v: string) => router.push(`/cardapio-do-dia?dia=${v}`);
  const domingo = dow === 0;
  const vazio =
    sel.proteinas.length === 0 &&
    sel.carboidratos.length === 0 &&
    sel.especial.length === 0;

  function salvar(publicar: boolean) {
    setMsg(null);
    start(async () => {
      const r = await salvarCardapio(
        dia,
        {
          proteinas: sel.proteinas.join("\n"),
          carboidratos: sel.carboidratos.join("\n"),
          especial: sel.especial.join("\n"),
          preco_livre: numero(precos.livre),
          preco_kg: numero(precos.kg),
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

  // Copia o cardápio de um dia já preenchido (mesmo dia da semana primeiro).
  function copiarDe(origem: Cardapio) {
    const p = PRECOS[diaSemanaN(dia)];
    setSel({
      proteinas: paraLinhas(origem.proteinas),
      carboidratos: paraLinhas(origem.carboidratos),
      especial: paraLinhas(origem.especial),
    });
    setPrecos({
      livre: texto(p?.livre ?? origem.preco_livre ?? null),
      kg: texto(p?.kg ?? origem.preco_kg ?? null),
    });
    setMsg("Copiado de " + dataBR(origem.data) + " — ajuste e publique.");
  }
  const preenchidos = dias
    .filter((c) => c.data !== dia && (c.proteinas || c.carboidratos))
    .sort((a, b) => (a.data < b.data ? 1 : -1));
  const mesmoDiaSemana = preenchidos.find((c) => diaSemanaN(c.data) === dow);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Cardápio do dia
      </h1>
      <p className="mt-1 text-zinc-500">
        Clique nos pratos para montar o dia. O que você publicar aparece em{" "}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          brasarestaurante.com.br/cardapio
        </span>
        .
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
          {vazio && (mesmoDiaSemana || preenchidos[0]) && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>Começar a partir de:</span>
              {mesmoDiaSemana && (
                <button onClick={() => copiarDe(mesmoDiaSemana)} className={btn}>
                  {SEMANA[dow]} de {dataBR(mesmoDiaSemana.data).slice(0, 5)}
                </button>
              )}
              {preenchidos[0] && preenchidos[0] !== mesmoDiaSemana && (
                <button onClick={() => copiarDe(preenchidos[0])} className={btn}>
                  último preenchido ({dataBR(preenchidos[0].data).slice(0, 5)})
                </button>
              )}
            </div>
          )}

          {/* Blocos */}
          <div className="space-y-4">
            {BLOCOS.map((b) => (
              <BlocoItens
                key={b.grupo}
                titulo={b.titulo}
                grupo={b.grupo}
                catalogo={itens.filter((i) => i.grupo === b.grupo)}
                escolhidos={sel[b.grupo]}
                aoMudar={(novos) => setSel((s) => ({ ...s, [b.grupo]: novos }))}
              />
            ))}
          </div>

          {/* Preços e ações */}
          <div className="mt-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap gap-3">
              <div>
                <label className={rotulo}>LIVRE (R$)</label>
                <input
                  inputMode="decimal"
                  value={precos.livre}
                  onChange={(e) => setPrecos((s) => ({ ...s, livre: e.target.value }))}
                  className={`${campo} w-28 text-right`}
                />
              </div>
              <div>
                <label className={rotulo}>KG (R$)</label>
                <input
                  inputMode="decimal"
                  value={precos.kg}
                  onChange={(e) => setPrecos((s) => ({ ...s, kg: e.target.value }))}
                  className={`${campo} w-28 text-right`}
                />
              </div>
              <p className="self-end pb-2 text-[11px] text-zinc-400">
                Sugeridos pelo dia da semana ({moeda(sugerido?.livre ?? null)} e{" "}
                {moeda(sugerido?.kg ?? null)}).
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <button
                disabled={proc}
                onClick={() => salvar(true)}
                className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {proc
                  ? "Salvando..."
                  : atual?.publicado
                    ? "Salvar e manter no ar"
                    : "Publicar no site"}
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
                        setSel({ proteinas: [], carboidratos: [], especial: [] });
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
            {msg && (
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{msg}</p>
            )}
          </div>
        </div>

        {/* Coluna da direita */}
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
                  return (
                    <button
                      key={v}
                      onClick={() => irPara(v)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
                        v === dia
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
              {BLOCOS.map((b) =>
                sel[b.grupo].length > 0 ? (
                  <div key={b.grupo} className="mb-3">
                    <span className="inline-block bg-[#C78340] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#211915]">
                      {b.titulo}
                    </span>
                    <ul className="mt-1.5 space-y-0.5 text-sm">
                      {sel[b.grupo].map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
              <div className="mt-4 flex justify-center gap-3">
                <span className="rounded-lg bg-[#C78340] px-4 py-1.5 text-center text-[#211915]">
                  <b className="block text-[10px] uppercase tracking-wider">Livre</b>
                  <b className="text-sm">{moeda(numero(precos.livre))}</b>
                </span>
                <span className="rounded-lg bg-[#C78340] px-4 py-1.5 text-center text-[#211915]">
                  <b className="block text-[10px] uppercase tracking-wider">KG</b>
                  <b className="text-sm">{moeda(numero(precos.kg))}</b>
                </span>
              </div>
            </div>
            <p className="bg-zinc-50 px-3 py-2 text-[11px] text-zinc-400 dark:bg-zinc-900">
              Prévia de como fica no site.
            </p>
          </div>

          <GerenciarCatalogo itens={itens} proc={proc} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- um bloco (proteínas, carboidratos, especial) ---------------- */
function BlocoItens({
  titulo,
  grupo,
  catalogo,
  escolhidos,
  aoMudar,
}: {
  titulo: string;
  grupo: Grupo;
  catalogo: ItemCat[];
  escolhidos: string[];
  aoMudar: (novos: string[]) => void;
}) {
  const [busca, setBusca] = useState("");

  const sugestoes = useMemo(() => {
    const q = norm(busca.trim());
    const livres = catalogo.filter((i) => !escolhidos.includes(i.nome));
    const achados = q
      ? livres.filter((i) => norm(i.nome).includes(q))
      : livres;
    return achados
      .sort((a, b) => b.usos - a.usos || a.nome.localeCompare(b.nome))
      .slice(0, q ? 24 : 12);
  }, [busca, catalogo, escolhidos]);

  const add = (nome: string) => {
    const n = nome.trim();
    if (!n || escolhidos.includes(n)) return;
    aoMudar([...escolhidos, n]);
    setBusca("");
  };
  const remover = (i: number) => aoMudar(escolhidos.filter((_, idx) => idx !== i));
  const mover = (i: number, passo: number) => {
    const j = i + passo;
    if (j < 0 || j >= escolhidos.length) return;
    const novos = [...escolhidos];
    [novos[i], novos[j]] = [novos[j], novos[i]];
    aoMudar(novos);
  };
  const novoItem =
    busca.trim() &&
    !catalogo.some((i) => norm(i.nome) === norm(busca.trim())) &&
    !escolhidos.some((e) => norm(e) === norm(busca.trim()));

  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="inline-block bg-orange-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
          {titulo}
        </span>
        <span className="text-[11px] text-zinc-400">
          {escolhidos.length} no cardápio · {catalogo.length} no catálogo
        </span>
      </div>

      {/* Escolhidos */}
      {escolhidos.length > 0 && (
        <ol className="mb-3 space-y-1">
          {escolhidos.map((nome, i) => (
            <li
              key={nome}
              className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <span className="flex-1">{nome}</span>
              <button
                onClick={() => mover(i, -1)}
                title="Subir"
                className="text-zinc-300 hover:text-orange-600 dark:text-zinc-600"
              >
                ↑
              </button>
              <button
                onClick={() => mover(i, 1)}
                title="Descer"
                className="text-zinc-300 hover:text-orange-600 dark:text-zinc-600"
              >
                ↓
              </button>
              <button
                onClick={() => remover(i)}
                title="Tirar do cardápio"
                className="text-zinc-300 hover:text-red-600 dark:text-zinc-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* Busca */}
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(sugestoes[0]?.nome ?? busca);
          }
        }}
        placeholder={`Buscar em ${titulo.toLowerCase()}... (ou digite um prato novo)`}
        className={`${campo} w-full`}
      />

      {/* Sugestões */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {novoItem && (
          <button
            onClick={() => add(busca)}
            className="rounded-full border border-dashed border-orange-400 px-2.5 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30"
          >
            + criar “{busca.trim()}”
          </button>
        )}
        {sugestoes.map((i) => (
          <button
            key={i.id}
            onClick={() => add(i.nome)}
            title={i.usos > 0 ? `usado ${i.usos}x` : "ainda não usado"}
            className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-orange-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            {i.nome}
          </button>
        ))}
        {sugestoes.length === 0 && !novoItem && (
          <span className="text-xs text-zinc-400">Tudo já está no cardápio de hoje.</span>
        )}
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        {busca
          ? "Enter põe o primeiro da lista."
          : `Mostrando os mais usados de ${grupo === "especial" ? "especial do dia" : titulo.toLowerCase()} — digite para buscar o resto.`}
      </p>
    </div>
  );
}

/* ---------------- catálogo de pratos ---------------- */
function GerenciarCatalogo({ itens, proc }: { itens: ItemCat[]; proc: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [grupo, setGrupo] = useState<Grupo>("proteinas");
  const [novos, setNovos] = useState("");
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const lista = useMemo(() => {
    const q = norm(busca.trim());
    return itens
      .filter((i) => i.grupo === grupo && (!q || norm(i.nome).includes(q)))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [itens, grupo, busca]);

  return (
    <details className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Catálogo de pratos ({itens.length})
      </summary>

      <div className="mt-3 space-y-3">
        <div className="flex gap-2">
          {BLOCOS.map((b) => (
            <button
              key={b.grupo}
              onClick={() => setGrupo(b.grupo)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                grupo === b.grupo
                  ? "bg-orange-500 text-white"
                  : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              }`}
            >
              {b.titulo}
            </button>
          ))}
        </div>

        <div>
          <label className={rotulo}>Cadastrar vários (um por linha)</label>
          <textarea
            rows={3}
            value={novos}
            onChange={(e) => setNovos(e.target.value)}
            placeholder={"Frango ao curry\nTilápia grelhada"}
            className={`${campo} w-full`}
          />
          <button
            disabled={proc || !novos.trim()}
            onClick={() =>
              start(async () => {
                const r = await criarItens(grupo, novos);
                setMsg(r.ok ? `✓ ${r.total} item(ns) no catálogo.` : (r.erro ?? "Não deu."));
                if (r.ok) setNovos("");
                router.refresh();
              })
            }
            className="mt-2 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-700"
          >
            Cadastrar
          </button>
          {msg && <p className="mt-1 text-[11px] text-zinc-500">{msg}</p>}
        </div>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 Procurar no catálogo..."
          className={`${campo} w-full`}
        />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {lista.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <span>
                {i.nome}
                {i.usos > 0 && (
                  <span className="ml-1 text-zinc-400">· {i.usos}x</span>
                )}
              </span>
              <button
                onClick={() => {
                  if (confirm(`Tirar “${i.nome}” do catálogo?`))
                    start(async () => {
                      await apagarItem(i.id);
                      router.refresh();
                    });
                }}
                className="text-zinc-300 hover:text-red-600 dark:text-zinc-600"
              >
                ✕
              </button>
            </div>
          ))}
          {lista.length === 0 && (
            <p className="text-xs text-zinc-400">Nada encontrado nesse grupo.</p>
          )}
        </div>
        <p className="text-[11px] text-zinc-400">
          Tirar do catálogo não mexe nos cardápios já publicados. Para mudar um
          prato de grupo, apague aqui e cadastre no grupo certo.
        </p>
      </div>
    </details>
  );
}
