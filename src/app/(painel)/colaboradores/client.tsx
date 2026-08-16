"use client";

import { useState } from "react";
import type { Colaborador } from "@/lib/types";
import {
  salvarColaborador,
  excluirColaborador,
  zerarPinColaborador,
} from "./actions";

function LinkApp({ c }: { c: Colaborador }) {
  const [copiado, setCopiado] = useState(false);
  if (!c.token) return <span className="text-xs text-zinc-400">—</span>;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/eu/${c.token}`;
  const zap = (c.whatsapp ?? "").replace(/\D/g, "");
  const zapNum = zap ? (zap.startsWith("55") ? zap : `55${zap}`) : "";
  const msg = encodeURIComponent(
    `Oi ${c.nome}! Esse é o seu app da contagem da Brasa. Abra o link e "adicione à tela de início" do celular:\n${link}`,
  );
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        onClick={() => {
          navigator.clipboard?.writeText(link);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        }}
        className="rounded border border-zinc-300 px-2 py-1 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        {copiado ? "Copiado!" : "Copiar link"}
      </button>
      {zapNum && (
        <a
          href={`https://wa.me/${zapNum}?text=${msg}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-green-500 px-2 py-1 font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
        >
          Enviar no WhatsApp
        </a>
      )}
      <span className={c.pin ? "text-zinc-400" : "text-amber-600"}>
        {c.pin ? "PIN definido" : "sem PIN"}
      </span>
      {c.pin && (
        <form action={zerarPinColaborador} className="inline">
          <input type="hidden" name="id" value={c.id} />
          <button className="text-zinc-400 hover:text-red-600">zerar PIN</button>
        </form>
      )}
    </div>
  );
}

function CardApp({ c }: { c: Colaborador }) {
  const [copiado, setCopiado] = useState(false);
  if (!c.token)
    return (
      <div className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-400 dark:border-zinc-800">
        {c.nome} — sem link
      </div>
    );
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/eu/${c.token}`;
  const zap = (c.whatsapp ?? "").replace(/\D/g, "");
  const zapNum = zap ? (zap.startsWith("55") ? zap : `55${zap}`) : "";
  const msg = encodeURIComponent(
    `Oi ${c.nome}! Esse é o seu app da contagem da Brasa. Abra o link e "adicione à tela de início" do celular:\n${link}`,
  );
  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
          {c.nome}
        </span>
        <span className={`text-xs ${c.pin ? "text-zinc-400" : "text-amber-600"}`}>
          {c.pin ? "PIN ok" : "sem PIN"}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          }}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {copiado ? "Copiado!" : "Copiar link"}
        </button>
        {zapNum && (
          <a
            href={`https://wa.me/${zapNum}?text=${msg}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg bg-green-600 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-green-700"
          >
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function ColaboradoresClient({
  colaboradores,
}: {
  colaboradores: Colaborador[];
}) {
  const [editando, setEditando] = useState<Colaborador | null>(null);
  const [aberto, setAberto] = useState(false);
  const [verLinks, setVerLinks] = useState(false);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Colaboradores
          </h1>
          <p className="mt-1 text-zinc-500">
            Quem faz a contagem. {colaboradores.length} cadastrado
            {colaboradores.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVerLinks((v) => !v)}
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            📲 Enviar app
          </button>
          <button
            onClick={() => {
              setEditando(null);
              setAberto(true);
            }}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
          >
            + Adicionar
          </button>
        </div>
      </div>

      {verLinks && (
        <div className="mb-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <p className="mb-4 text-sm text-zinc-500">
            Envie o <b>app pessoal</b> para quem você quiser. Cada colaborador
            abre o link, cria um PIN e adiciona à tela do celular. As contagens
            dele aparecem lá.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {colaboradores.map((c) => (
              <CardApp key={c.id} c={c} />
            ))}
          </div>
        </div>
      )}

      {colaboradores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum colaborador ainda. Cadastre quem vai ajudar na contagem.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">WhatsApp</th>
                <th className="px-4 py-3">App do colaborador</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {colaboradores.map((c) => (
                <tr
                  key={c.id}
                  className="bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {c.nome}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {c.whatsapp ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <LinkApp c={c} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEditando(c);
                        setAberto(true);
                      }}
                      className="mr-3 text-orange-600 hover:underline"
                    >
                      Editar
                    </button>
                    <form action={excluirColaborador} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        className="text-zinc-400 hover:text-red-600"
                      >
                        Remover
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {editando ? "Editar colaborador" : "Novo colaborador"}
            </h2>
            <form
              action={async (fd) => {
                await salvarColaborador(fd);
                setAberto(false);
              }}
              className="space-y-3"
            >
              {editando && <input type="hidden" name="id" value={editando.id} />}
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Nome *
                </label>
                <input
                  name="nome"
                  required
                  autoFocus
                  defaultValue={editando?.nome ?? ""}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  WhatsApp
                </label>
                <input
                  name="whatsapp"
                  placeholder="(51) 99999-9999"
                  defaultValue={editando?.whatsapp ?? ""}
                  className={inputCls}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
