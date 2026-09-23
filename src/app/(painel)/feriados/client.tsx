"use client";

import { useState, useTransition } from "react";
import { Icone } from "@/components/icone";
import { Enviar, BotaoAcao } from "@/components/enviar";
import { confirmar, avisar } from "@/components/dialogo";
import { SITUACAO, quandoE, rotuloDoDia, type Feriado, type SituacaoFeriado } from "@/lib/feriados";
import { criarFeriado, decidirFeriado, excluirFeriado, trazerCalendario } from "./actions";

const ESCOLHAS: SituacaoFeriado[] = ["abre", "fecha", "especial"];

export function FeriadosClient({ feriados, hoje }: { feriados: Feriado[]; hoje: string }) {
  const [salvando, comSalvar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<Record<string, string>>({});

  const futuros = feriados.filter((f) => f.data >= hoje);
  const passados = feriados.filter((f) => f.data < hoje).reverse();
  const aDefinir = futuros.filter((f) => f.situacao === "indefinido").length;

  function aviso(texto: string) {
    setMsg(texto);
    setTimeout(() => setMsg(null), 6000);
  }

  function decidir(f: Feriado, situacao: SituacaoFeriado) {
    comSalvar(async () => {
      const r = await decidirFeriado(f.id, situacao, detalhes[f.id] ?? f.detalhe ?? "");
      if (!r.ok) aviso(r.erro);
    });
  }

  function salvarDetalhe(f: Feriado) {
    const novo = (detalhes[f.id] ?? "").trim();
    if (novo === (f.detalhe ?? "")) return;
    comSalvar(async () => {
      const r = await decidirFeriado(f.id, f.situacao, novo);
      if (!r.ok) aviso(r.erro);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- Trazer o calendário + data nova ---------- */}
      <div className="flex flex-col gap-3 rounded-cartao bg-painel-cartao p-4">
        <div className="flex flex-wrap items-center gap-3">
          <BotaoAcao
            aoClicar={async () => {
              const r = await trazerCalendario();
              if (!r.ok) aviso(r.erro);
              else if (r.adicionados === 0) aviso("Todas as datas do calendário já estão aqui.");
              else aviso(`${r.adicionados} data(s) trazida(s) — agora é só dizer o que a casa faz em cada uma.`);
            }}
            className="min-h-11 rounded-controle border border-borda-forte px-4 text-sm font-medium text-texto-suave transition hover:bg-superficie-suave"
          >
            <Icone nome="agenda" tamanho={16} /> Trazer os feriados do calendário
          </BotaoAcao>
          <span className="text-sm text-texto-fraco">
            Nacionais e a Revolução Farroupilha, até um ano e meio à frente. As de Ivoti você acrescenta aqui do lado.
          </span>
        </div>

        <form
          action={async (fd) => {
            const r = await criarFeriado(fd);
            if (!r.ok) aviso(r.erro);
            else (document.getElementById("form-feriado") as HTMLFormElement | null)?.reset();
          }}
          id="form-feriado"
          className="flex flex-wrap items-end gap-3 border-t border-borda pt-3"
        >
          <div>
            <label className="mb-1 block text-xs text-texto-suave" htmlFor="f-data">Data</label>
            <input
              id="f-data"
              name="data"
              type="date"
              required
              className="min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
            />
          </div>
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-xs text-texto-suave" htmlFor="f-nome">O que é</label>
            <input
              id="f-nome"
              name="nome"
              required
              placeholder="Ex.: Aniversário de Ivoti"
              className="min-h-11 w-full rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-texto-suave" htmlFor="f-sit">A casa</label>
            <select
              id="f-sit"
              name="situacao"
              defaultValue="indefinido"
              className="min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
            >
              <option value="indefinido">{SITUACAO.indefinido.longo}</option>
              {ESCOLHAS.map((s) => (
                <option key={s} value={s}>{SITUACAO[s].longo}</option>
              ))}
            </select>
          </div>
          <Enviar className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90">
            <Icone nome="novo" tamanho={16} /> Acrescentar
          </Enviar>
        </form>
      </div>

      {msg && (
        <p className="rounded-controle bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {msg}
        </p>
      )}

      {aDefinir > 0 && (
        <p className="text-sm text-texto-suave">
          <strong className="text-texto">{aDefinir}</strong> data(s) ainda sem decisão. Enquanto isso, as telas mostram
          &ldquo;a definir&rdquo; — que é o lembrete de resolver antes de a equipe perguntar.
        </p>
      )}

      {/* ---------- As que vêm aí ---------- */}
      {futuros.length === 0 ? (
        <p className="rounded-cartao bg-painel-cartao p-5 text-sm text-texto-fraco">
          Nenhuma data cadastrada pra frente. Use o botão acima pra trazer o calendário.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-cartao bg-painel-cartao">
          {futuros.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-borda px-4 py-3 last:border-0">
              <div className="w-44 shrink-0">
                <p className="font-numero text-sm font-semibold tracking-apertada text-texto">{rotuloDoDia(f.data)}</p>
                <p className="text-xs text-texto-fraco">{quandoE(hoje, f.data)}</p>
              </div>
              <p className="min-w-40 flex-1 text-sm text-texto">{f.nome}</p>

              {/* Três botões em vez de uma lista: é uma decisão de três
                  caminhos, e ver os três lado a lado é mais rápido que abrir
                  uma lista pra escolher. */}
              <div className="flex shrink-0 gap-1.5">
                {ESCOLHAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => decidir(f, s)}
                    disabled={salvando}
                    className={`min-h-9 rounded-controle px-3 text-xs font-semibold transition ${
                      f.situacao === s
                        ? "bg-texto text-fundo"
                        : "border border-borda-forte text-texto-suave hover:bg-superficie-suave"
                    }`}
                  >
                    {SITUACAO[s].longo}
                  </button>
                ))}
              </div>

              <input
                value={detalhes[f.id] ?? f.detalhe ?? ""}
                onChange={(e) => setDetalhes((d) => ({ ...d, [f.id]: e.target.value }))}
                onBlur={() => salvarDetalhe(f)}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                placeholder="só o almoço, fecha às 14h…"
                className="min-h-9 w-52 rounded-controle border border-borda-forte bg-transparent px-2 text-xs text-texto focus:border-primaria"
              />

              {f.situacao === "indefinido" && (
                <span className="rounded-controle bg-amber-100 px-1.5 py-0.5 text-mini font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  a definir
                </span>
              )}

              <BotaoAcao
                aoClicar={async () => {
                  if (!(await confirmar(`Tirar "${f.nome}" da lista?`, { perigo: true }))) return;
                  const r = await excluirFeriado(f.id);
                  if (!r.ok) void avisar(r.erro);
                }}
                className="text-xs text-texto-fraco hover:text-red-600 hover:underline"
              >
                tirar
              </BotaoAcao>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- O que já passou ---------- */}
      {passados.length > 0 && (
        <details className="rounded-cartao bg-painel-cartao p-4">
          <summary className="cursor-pointer text-sm text-texto-suave">
            Datas que já passaram ({passados.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-1">
            {passados.slice(0, 30).map((f) => (
              <li key={f.id} className="flex items-baseline gap-3 text-xs text-texto-fraco">
                <span className="w-24 font-numero tracking-apertada">{rotuloDoDia(f.data)}</span>
                <span className="flex-1">{f.nome}</span>
                <span>{SITUACAO[f.situacao].longo}{f.detalhe ? ` · ${f.detalhe}` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
