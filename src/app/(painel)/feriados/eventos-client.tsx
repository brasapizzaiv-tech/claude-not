"use client";

import { useState, useTransition } from "react";
import { Icone } from "@/components/icone";
import { Enviar, BotaoAcao } from "@/components/enviar";
import { confirmar, avisar } from "@/components/dialogo";
import { quandoE, rotuloDoDia } from "@/lib/feriados";
import { STATUS_EVENTO, resumoDoEvento, type Evento, type StatusEvento } from "@/lib/eventos";
import { excluirEvento, salvarEvento, statusDoEvento } from "./eventos-actions";

const LUGARES = ["Salão", "Deck", "Área kids", "Casa toda"];
const CAMPO =
  "min-h-11 w-full rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";
const ROTULO = "mb-1 block text-xs text-texto-suave";

export function EventosClient({ eventos, hoje }: { eventos: Evento[]; hoje: string }) {
  const [salvando, comSalvar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  const futuros = eventos.filter((e) => e.data >= hoje);
  const passados = eventos.filter((e) => e.data < hoje).reverse();
  const formAberto = abrindo || editando !== null;

  function aviso(texto: string) {
    setMsg(texto);
    setTimeout(() => setMsg(null), 6000);
  }

  function fechar() {
    setAbrindo(false);
    setEditando(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- Marcar / editar ---------- */}
      {!formAberto ? (
        <div>
          <button
            onClick={() => setAbrindo(true)}
            className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90"
          >
            <span className="inline-flex items-center gap-2">
              <Icone nome="novo" tamanho={16} /> Marcar um evento
            </span>
          </button>
        </div>
      ) : (
        <form
          key={editando?.id ?? "novo"}
          action={async (fd) => {
            const r = await salvarEvento(fd);
            if (!r.ok) aviso(r.erro);
            else fechar();
          }}
          className="flex flex-col gap-3 rounded-cartao bg-painel-cartao p-4"
        >
          <input type="hidden" name="id" value={editando?.id ?? ""} />
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-texto">
              {editando ? "Mudar o evento" : "Marcar um evento"}
            </p>
            <button type="button" onClick={fechar} className="text-xs text-texto-fraco hover:underline">
              cancelar
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="w-40">
              <label className={ROTULO} htmlFor="e-data">Data</label>
              <input id="e-data" name="data" type="date" required defaultValue={editando?.data} className={CAMPO} />
            </div>
            <div className="w-32">
              <label className={ROTULO} htmlFor="e-hora">Horário</label>
              {/* Texto livre: o que se combina é "20h", "a partir das 19h30". */}
              <input id="e-hora" name="hora" placeholder="20h" defaultValue={editando?.hora ?? ""} className={CAMPO} />
            </div>
            <div className="min-w-56 flex-1">
              <label className={ROTULO} htmlFor="e-titulo">O que é</label>
              <input
                id="e-titulo"
                name="titulo"
                required
                placeholder="Ex.: Aniversário de 15 anos da Ana"
                defaultValue={editando?.titulo}
                className={CAMPO}
              />
            </div>
            <div className="w-32">
              <label className={ROTULO} htmlFor="e-pessoas">Pessoas</label>
              <input
                id="e-pessoas"
                name="pessoas"
                type="number"
                min={0}
                placeholder="0"
                defaultValue={editando?.pessoas || ""}
                className={CAMPO}
              />
            </div>
            <div className="w-40">
              <label className={ROTULO} htmlFor="e-lugar">Onde</label>
              <select id="e-lugar" name="lugar" defaultValue={editando?.lugar ?? ""} className={CAMPO}>
                <option value="">A combinar</option>
                {LUGARES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-48 flex-1">
              <label className={ROTULO} htmlFor="e-contato">De quem é</label>
              <input id="e-contato" name="contato" placeholder="Nome" defaultValue={editando?.contato ?? ""} className={CAMPO} />
            </div>
            <div className="w-48">
              <label className={ROTULO} htmlFor="e-telefone">Telefone</label>
              <input id="e-telefone" name="telefone" defaultValue={editando?.telefone ?? ""} className={CAMPO} />
            </div>
          </div>

          <div>
            <label className={ROTULO} htmlFor="e-cardapio">
              O que foi combinado de comer e beber
              <span className="ml-2 text-texto-fraco">é o que a cozinha lê na TV</span>
            </label>
            <textarea
              id="e-cardapio"
              name="cardapio"
              rows={2}
              placeholder="Ex.: rodízio completo, entrada de pão de alho, bolo trazido pelo cliente, refri incluso"
              defaultValue={editando?.cardapio ?? ""}
              className={`${CAMPO} py-2`}
            />
          </div>

          <div>
            <label className={ROTULO} htmlFor="e-obs">Observações</label>
            <input
              id="e-obs"
              name="observacao"
              placeholder="Decoração própria, chega 18h pra montar…"
              defaultValue={editando?.observacao ?? ""}
              className={CAMPO}
            />
          </div>

          <div>
            <Enviar className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90">
              <Icone nome="certo" tamanho={16} /> {editando ? "Salvar" : "Marcar"}
            </Enviar>
          </div>
        </form>
      )}

      {msg && (
        <p className="rounded-controle bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {msg}
        </p>
      )}

      {/* ---------- Os que vêm aí ---------- */}
      {futuros.length === 0 ? (
        <p className="rounded-cartao bg-painel-cartao p-5 text-sm text-texto-fraco">
          Nenhum evento marcado. O que você marcar aqui aparece sozinho na TV da
          cozinha e no mural do escritório.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {futuros.map((e) => (
            <li key={e.id} className="rounded-cartao bg-painel-cartao p-4">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="font-numero text-sm font-semibold tracking-apertada text-texto">{rotuloDoDia(e.data)}</p>
                <p className="text-xs text-texto-fraco">{quandoE(hoje, e.data)}</p>
                <p className="flex-1 text-sm font-semibold text-texto">{e.titulo}</p>
                <span className="text-xs font-semibold" style={{ color: STATUS_EVENTO[e.status].cor }}>
                  {STATUS_EVENTO[e.status].longo}
                </span>
              </div>

              <p className="mt-1 text-sm text-texto-suave">{resumoDoEvento(e) || "a combinar"}</p>
              {e.cardapio && <p className="mt-1 text-sm text-texto-suave">{e.cardapio}</p>}
              {e.observacao && <p className="mt-1 text-xs text-texto-fraco">{e.observacao}</p>}
              {(e.contato || e.telefone) && (
                <p className="mt-1 text-xs text-texto-fraco">
                  {e.contato}
                  {e.telefone ? ` · ${e.telefone}` : ""}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => { setEditando(e); setAbrindo(false); }}
                  className="text-xs text-texto-suave hover:text-texto hover:underline"
                >
                  mudar
                </button>
                {(["marcado", "confirmado", "cancelado"] as StatusEvento[])
                  .filter((s) => s !== e.status)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => comSalvar(async () => {
                        const r = await statusDoEvento(e.id, s);
                        if (!r.ok) aviso(r.erro);
                      })}
                      disabled={salvando}
                      className="text-xs text-texto-suave hover:text-texto hover:underline"
                    >
                      marcar como {STATUS_EVENTO[s].longo.toLowerCase()}
                    </button>
                  ))}
                <BotaoAcao
                  aoClicar={async () => {
                    if (!(await confirmar(`Apagar o evento "${e.titulo}"?`, { perigo: true }))) return;
                    const r = await excluirEvento(e.id);
                    if (!r.ok) void avisar(r.erro);
                  }}
                  className="ml-auto text-xs text-texto-fraco hover:text-red-600 hover:underline"
                >
                  apagar
                </BotaoAcao>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- O que já passou ---------- */}
      {passados.length > 0 && (
        <details className="rounded-cartao bg-painel-cartao p-4">
          <summary className="cursor-pointer text-sm text-texto-suave">
            Eventos que já aconteceram ({passados.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-1">
            {passados.slice(0, 40).map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 text-xs text-texto-fraco">
                <span className="w-24 font-numero tracking-apertada">{rotuloDoDia(e.data)}</span>
                <span className="flex-1">{e.titulo}</span>
                <span>{resumoDoEvento(e)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
