"use client";

import { useState } from "react";
import Link from "next/link";
import type { Colaborador } from "@/lib/types";
import { GRUPOS, GRUPO_KEYS, DIAS, type GrupoKey } from "@/lib/folgas";
import { TURNOS, aniversarioBR } from "@/lib/equipe";
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

const fmtR = (v: number | null | undefined) =>
  v == null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function resumoQuadro(c: Colaborador): string {
  const partes: string[] = [];
  if (c.turno) partes.push(`${TURNOS[c.turno].icone} ${TURNOS[c.turno].nome}`);
  if (c.vinculo === "clt") partes.push(c.salario_base ? `CLT R$ ${fmtR(c.salario_base)}` : "CLT");
  else {
    const v = [c.valor_dia ? `dia ${fmtR(c.valor_dia)}` : "", c.valor_noite ? `noite ${fmtR(c.valor_noite)}` : ""].filter(Boolean).join(" / ");
    if (v) partes.push(`R$ ${v}`);
  }
  if (c.recebe_10) partes.push("10%");
  if (c.esporadico) partes.push("free esporádico");
  return partes.join(" · ");
}

export function ColaboradoresClient({ rows }: { rows: Row[] }) {
  const [editando, setEditando] = useState<Row | null>(null);
  const [aberto, setAberto] = useState(false);
  const [verLinks, setVerLinks] = useState(false);
  const [busca, setBusca] = useState("");

  const mesAtual = new Date().getMonth() + 1;
  const aniversariantes = rows
    .filter((c) => c.nascimento && Number(c.nascimento.split("-")[1]) === mesAtual)
    .sort((a, b) => (a.nascimento! > b.nascimento! ? 1 : -1));
  const visiveis = busca ? rows.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase())) : rows;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Colaboradores</h1>
          <p className="mt-1 text-zinc-500">
            A equipe. {rows.length} cadastrado{rows.length === 1 ? "" : "s"}.
            {" "}<Link href="/colaboradores/semana" className="text-orange-600 hover:underline">🗓️ Semana e 10%</Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar…"
            className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
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

      {aniversariantes.length > 0 && (
        <div className="mb-6 rounded-2xl border border-pink-200 bg-pink-50/60 p-4 text-sm dark:border-pink-900 dark:bg-pink-950/20">
          <span className="font-semibold">🎂 Aniversariantes do mês:</span>{" "}
          {aniversariantes.map((c) => `${c.nome} (${aniversarioBR(c.nascimento)})`).join(" · ")}
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
              {visiveis.map((c) => (
                <tr key={c.id} className="bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900">
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {c.nome}
                    {c.nascimento && <span className="ml-2 text-xs font-normal text-pink-600">🎂 {aniversarioBR(c.nascimento)}</span>}
                    {c.whatsapp && <div className="text-xs font-normal text-zinc-400">{c.whatsapp}</div>}
                    <div className="text-xs font-normal text-zinc-500">{resumoQuadro(c)}</div>
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
  const [turno, setTurno] = useState<string>(editando?.turno ?? "dia");
  const [vinc, setVinc] = useState<string>(editando?.vinculo ?? "freelance");
  const [maisDados, setMaisDados] = useState(false);

  const diaBtn = (name: string, n: number, checked: boolean) => (
    <label key={n} className="flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700">
      <input type="checkbox" name={name} value={n} defaultChecked={checked} /> {DIAS[n]}
    </label>
  );
  const lbl = "mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400";
  const temDia = turno === "dia" || turno === "ambos";
  const temNoite = turno === "noite" || turno === "ambos";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {editando ? "Editar pessoa" : "Nova pessoa"}
        </h2>
        <form action={async (fd) => { await salvarColaborador(fd); onClose(); }} className="space-y-3">
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Nome *</label>
              <input name="nome" required autoFocus defaultValue={editando?.nome ?? ""} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">🎂 Aniversário</label>
              <input name="nascimento" placeholder="dd/mm" defaultValue={aniversarioBR(editando?.nascimento)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">WhatsApp</label>
            <input name="whatsapp" placeholder="(51) 99999-9999" defaultValue={editando?.whatsapp ?? ""} className={inputCls} />
          </div>

          {/* Quadro / pagamento */}
          <div className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs font-bold uppercase text-zinc-400">Turno e pagamento</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className={lbl}>Turno</label>
                <select name="turno" value={turno} onChange={(e) => setTurno(e.target.value)} className={inputCls}>
                  <option value="dia">☀️ Dia</option>
                  <option value="noite">🌙 Noite</option>
                  <option value="ambos">☀️🌙 Dia e noite</option>
                  <option value="proprietario">👑 Proprietário</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Vínculo</label>
                <select name="vinc" value={vinc} onChange={(e) => setVinc(e.target.value)} className={inputCls}>
                  <option value="freelance">Freelance (por dia)</option>
                  <option value="clt">Carteira assinada (salário)</option>
                </select>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {vinc === "clt" ? (
                <div>
                  <label className={lbl}>Salário (R$)</label>
                  <input name="salario_base" inputMode="decimal" placeholder="0,00" defaultValue={fmtR(editando?.salario_base)} className={inputCls} />
                </div>
              ) : (
                <>
                  <div className={temDia ? "" : "opacity-40"}>
                    <label className={lbl}>☀️ Valor do dia (R$)</label>
                    <input name="valor_dia" inputMode="decimal" placeholder="0,00" defaultValue={fmtR(editando?.valor_dia)} className={inputCls} />
                  </div>
                  <div className={temNoite ? "" : "opacity-40"}>
                    <label className={lbl}>🌙 Valor da noite (R$)</label>
                    <input name="valor_noite" inputMode="decimal" placeholder="0,00" defaultValue={fmtR(editando?.valor_noite)} className={inputCls} />
                  </div>
                </>
              )}
              <div>
                <label className={lbl}>Função</label>
                <input name="funcao_c" placeholder="Garçom, Forno…" defaultValue={editando?.funcao ?? ""} className={inputCls} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="recebe_10" defaultChecked={editando ? !!editando.recebe_10 : temNoite} /> Recebe o 10% da noite
              </label>
              <label className="flex items-center gap-1 text-xs text-zinc-500" title="1 = parte igual. 0,5 = meia parte. 2 = parte dupla.">
                peso <input name="peso_10" inputMode="decimal" defaultValue={fmtR(editando?.peso_10 ?? 1) || "1"} className={`${inputCls} w-14 px-2 py-1`} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="esporadico" defaultChecked={!!editando?.esporadico} /> Free esporádico (só aparece na semana quando chamado)
              </label>
            </div>
            {turno !== "proprietario" && (
              <div className="grid gap-2 sm:grid-cols-2">
                {temDia && (
                  <div>
                    <p className={lbl}>☀️ Dias fixos de DIA</p>
                    <div className="flex flex-wrap gap-1">{[1, 2, 3, 4, 5, 6, 0].map((n) => diaBtn("dias_dia", n, !!editando?.dias_dia?.includes(n)))}</div>
                  </div>
                )}
                {temNoite && (
                  <div>
                    <p className={lbl}>🌙 Noites fixas</p>
                    <div className="flex flex-wrap gap-1">{[1, 2, 3, 4, 5, 6, 0].map((n) => diaBtn("dias_noite", n, !!editando?.dias_noite?.includes(n)))}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <button type="button" onClick={() => setMaisDados((v) => !v)} className="text-sm text-orange-600 hover:underline">
            {maisDados ? "▾" : "▸"} Família e uniforme
          </button>
          <div className={maisDados ? "grid gap-2 sm:grid-cols-5" : "hidden"}>
            <div>
              <label className={lbl}>Filhos</label>
              <select name="filhos" defaultValue={editando?.filhos == null ? "" : editando.filhos ? "sim" : "nao"} className={inputCls}>
                <option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Cônjuge</label>
              <select name="conjuge" defaultValue={editando?.conjuge == null ? "" : editando.conjuge ? "sim" : "nao"} className={inputCls}>
                <option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Uniforme</label>
              <input name="uniforme_estilo" placeholder="Camiseta…" defaultValue={editando?.uniforme_estilo ?? ""} className={inputCls} />
            </div>
            <div>
              <label className={lbl}>Qtd</label>
              <input name="uniforme_qtd" inputMode="numeric" defaultValue={editando?.uniforme_qtd ?? ""} className={inputCls} />
            </div>
            <div>
              <label className={lbl}>Tamanho</label>
              <input name="uniforme_tamanho" placeholder="M, G…" defaultValue={editando?.uniforme_tamanho ?? ""} className={inputCls} />
            </div>
          </div>

          <p className="pt-1 text-xs font-bold uppercase text-zinc-400">App pessoal</p>
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
