"use client";

import { useState } from "react";
import type { Colaborador } from "@/lib/types";
import { GRUPOS, GRUPO_KEYS, DIAS, type GrupoKey } from "@/lib/folgas";
import {
  salvarColaborador,
  excluirColaborador,
  zerarPinColaborador,
  gerarTokenColaborador,
} from "./actions";

export type FolgaPerfil = {
  id: number;
  grupo: string;
  vinculo: string;
  funcao: string | null;
  dias: number[] | null;
  grupo2: string | null;
  dias2: number[] | null;
  gerente: boolean;
  ativo: boolean;
};
export type Row = Colaborador & { folga: FolgaPerfil | null };

function GerarLink({ id, small }: { id: string; small?: boolean }) {
  return (
    <form action={gerarTokenColaborador} className="inline">
      <input type="hidden" name="id" value={id} />
      <button
        className={
          small
            ? "rounded border border-orange-500 px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
            : "w-full rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
        }
      >
        Gerar link
      </button>
    </form>
  );
}

function LinkApp({ c }: { c: Colaborador }) {
  const [copiado, setCopiado] = useState(false);
  if (!c.token) return <GerarLink id={c.id} small />;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/eu/${c.token}`;
  const zap = (c.whatsapp ?? "").replace(/\D/g, "");
  const zapNum = zap ? (zap.startsWith("55") ? zap : `55${zap}`) : "";
  const msg = encodeURIComponent(
    `Oi ${c.nome}! Esse é o seu app da Brasa. Abra o link e "adicione à tela de início" do celular:\n${link}`,
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
          href={`https://web.whatsapp.com/send?phone=${zapNum}&text=${msg}`}
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
      <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-2 truncate font-medium text-zinc-900 dark:text-zinc-100">{c.nome}</div>
        <GerarLink id={c.id} />
      </div>
    );
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/eu/${c.token}`;
  const zap = (c.whatsapp ?? "").replace(/\D/g, "");
  const zapNum = zap ? (zap.startsWith("55") ? zap : `55${zap}`) : "";
  const msg = encodeURIComponent(
    `Oi ${c.nome}! Esse é o seu app da Brasa. Abra o link e "adicione à tela de início" do celular:\n${link}`,
  );
  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{c.nome}</span>
        <span className={`text-xs ${c.pin ? "text-zinc-400" : "text-amber-600"}`}>{c.pin ? "PIN ok" : "sem PIN"}</span>
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
            href={`https://web.whatsapp.com/send?phone=${zapNum}&text=${msg}`}
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

function resumoFolga(f: FolgaPerfil | null): string {
  if (!f) return "";
  const g = GRUPOS[f.grupo as GrupoKey]?.nome ?? f.grupo;
  const dias = (f.dias ?? []).map((d) => DIAS[d]).join(", ");
  const g2 = f.grupo2 ? ` + ${GRUPOS[f.grupo2 as GrupoKey]?.nome ?? f.grupo2}` : "";
  return `${g}${g2}${dias ? ` · ${dias}` : ""}${f.gerente ? " · gerência" : ""}`;
}

export function ColaboradoresClient({ rows }: { rows: Row[] }) {
  const [editando, setEditando] = useState<Row | null>(null);
  const [aberto, setAberto] = useState(false);
  const [verLinks, setVerLinks] = useState(false);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Colaboradores</h1>
          <p className="mt-1 text-zinc-500">
            A equipe. {rows.length} cadastrado{rows.length === 1 ? "" : "s"}.
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
            onClick={() => { setEditando(null); setAberto(true); }}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
          >
            + Adicionar
          </button>
        </div>
      </div>

      {verLinks && (
        <div className="mb-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <p className="mb-4 text-sm text-zinc-500">
            Envie o <b>app pessoal</b> (um link só por pessoa). Ela abre, cria um PIN e adiciona à tela do celular.
            Aparecem lá as contagens e/ou folgas dela.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((c) => <CardApp key={c.id} c={c} />)}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum colaborador ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Folga / Contagem</th>
                <th className="px-4 py-3">App pessoal</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((c) => (
                <tr key={c.id} className="bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900">
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {c.nome}
                    {c.whatsapp && <div className="text-xs font-normal text-zinc-400">{c.whatsapp}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                    {c.folga ? <div style={{ color: GRUPOS[c.folga.grupo as GrupoKey]?.cor }}>🌴 {resumoFolga(c.folga)}</div> : <span className="text-zinc-400">sem folga</span>}
                    <div className="text-zinc-400">{[c.faz_contagem ? "📦 contagem" : "", c.faz_etiquetas ? "🏷️ etiquetas" : "", c.faz_contas ? "💰 contas" : ""].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="px-4 py-3"><LinkApp c={c} /></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => { setEditando(c); setAberto(true); }}
                      className="mr-3 text-orange-600 hover:underline"
                    >
                      Editar
                    </button>
                    <form action={excluirColaborador} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="text-zinc-400 hover:text-red-600">Remover</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberto && <EditModal editando={editando} onClose={() => setAberto(false)} />}
    </div>
  );
}

function EditModal({ editando, onClose }: { editando: Row | null; onClose: () => void }) {
  const f = editando?.folga ?? null;
  const [temFolga, setTemFolga] = useState(!!f);
  const [grupo2, setGrupo2] = useState<string>(f?.grupo2 ?? "");

  const diaBtn = (name: string, n: number, checked: boolean) => (
    <label key={n} className="flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700">
      <input type="checkbox" name={name} value={n} defaultChecked={checked} /> {DIAS[n]}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {editando ? "Editar pessoa" : "Nova pessoa"}
        </h2>
        <form action={async (fd) => { await salvarColaborador(fd); onClose(); }} className="space-y-3">
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Nome *</label>
            <input name="nome" required autoFocus defaultValue={editando?.nome ?? ""} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">WhatsApp</label>
            <input name="whatsapp" placeholder="(51) 99999-9999" defaultValue={editando?.whatsapp ?? ""} className={inputCls} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="faz_contagem" defaultChecked={editando ? editando.faz_contagem : false} /> Faz contagem de estoque
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="faz_etiquetas" defaultChecked={editando ? editando.faz_etiquetas : false} /> Faz etiquetas (gerar / dar baixa)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="faz_contas" defaultChecked={editando ? editando.faz_contas : false} /> Contas a pagar (ver boletos e dar baixa) — gerencial
          </label>

          <label className="flex items-center gap-2 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
            <input type="checkbox" name="tem_folga" checked={temFolga} onChange={(e) => setTemFolga(e.target.checked)} /> Entra na escala de folgas
          </label>

          {temFolga && (
            <div className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="grid gap-2 sm:grid-cols-2">
                <select name="grupo" defaultValue={f?.grupo ?? "almoco"} className={inputCls}>
                  {GRUPO_KEYS.map((g) => <option key={g} value={g}>{GRUPOS[g].nome}</option>)}
                </select>
                <select name="vinculo" defaultValue={f?.vinculo ?? "Freelance"} className={inputCls}>
                  <option value="CLT">Carteira assinada</option>
                  <option value="Freelance">Freelance</option>
                </select>
              </div>
              <input name="funcao" placeholder="Função (ex.: Garçom, Forno)" defaultValue={f?.funcao ?? ""} className={inputCls} />
              <div>
                <p className="mb-1 text-xs font-bold uppercase text-zinc-400">Dias fixos</p>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 6].map((n) => diaBtn("dias", n, !!f?.dias?.includes(n)))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase text-zinc-400">2º turno (opcional)</p>
                <select name="grupo2" value={grupo2} onChange={(e) => setGrupo2(e.target.value)} className={inputCls}>
                  <option value="">Não trabalha em outro grupo</option>
                  {GRUPO_KEYS.map((g) => <option key={g} value={g}>{GRUPOS[g].nome}</option>)}
                </select>
                {grupo2 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5, 6].map((n) => diaBtn("dias2", n, !!f?.dias2?.includes(n)))}
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="gerente" defaultChecked={!!f?.gerente} /> Faz parte da gerência
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
              Cancelar
            </button>
            <button type="submit" className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
