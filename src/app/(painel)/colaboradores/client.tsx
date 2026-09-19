"use client";

import { Icone } from "@/components/icone";

import { siteUrl } from "@/lib/site-url";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { Colaborador } from "@/lib/types";
import { GRUPOS, GRUPO_KEYS, DIAS, type GrupoKey } from "@/lib/folgas";
import { TURNOS, aniversarioBR, vinculoDoTurno } from "@/lib/equipe";
import {
  salvarColaborador,
  desligarColaborador,
  reativarColaborador,
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
            : "w-full rounded-controle bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
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
  const origin = siteUrl();
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
        className="rounded border border-borda-forte px-2 py-1 text-texto-suave hover:bg-superficie-suave"
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
      <span className={c.pin ? "text-texto-fraco" : "text-amber-600"}>
        {c.pin ? "PIN definido" : "sem PIN"}
      </span>
      {c.pin && (
        <form action={zerarPinColaborador} className="inline">
          <input type="hidden" name="id" value={c.id} />
          <button className="text-texto-fraco hover:text-red-600">zerar PIN</button>
        </form>
      )}
    </div>
  );
}

function CardApp({ c }: { c: Colaborador }) {
  const [copiado, setCopiado] = useState(false);
  if (!c.token)
    return (
      <div className="rounded-cartao border border-borda p-3">
        <div className="mb-2 truncate font-medium text-texto">{c.nome}</div>
        <GerarLink id={c.id} />
      </div>
    );
  const origin = siteUrl();
  const link = `${origin}/eu/${c.token}`;
  const zap = (c.whatsapp ?? "").replace(/\D/g, "");
  const zapNum = zap ? (zap.startsWith("55") ? zap : `55${zap}`) : "";
  const msg = encodeURIComponent(
    `Oi ${c.nome}! Esse é o seu app da Brasa. Abra o link e "adicione à tela de início" do celular:\n${link}`,
  );
  return (
    <div className="rounded-cartao border border-borda p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate font-medium text-texto">{c.nome}</span>
        <span className={`text-xs ${c.pin ? "text-texto-fraco" : "text-amber-600"}`}>{c.pin ? "PIN ok" : "sem PIN"}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          }}
          className="flex-1 rounded-controle border border-borda-forte px-3 py-1.5 text-sm text-texto-suave hover:bg-superficie-suave"
        >
          {copiado ? "Copiado!" : "Copiar link"}
        </button>
        {zapNum && (
          <a
            href={`https://web.whatsapp.com/send?phone=${zapNum}&text=${msg}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-controle bg-texto px-3 py-1.5 text-center text-sm font-medium text-fundo hover:opacity-90"
          >
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-controle border border-borda-forte bg-white px-3 py-2 text-sm text-texto outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100";

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
  if (c.turno) partes.push(TURNOS[c.turno].nome);
  const cltDia = vinculoDoTurno(c, "dia") === "clt";
  const cltNoite = vinculoDoTurno(c, "noite") === "clt";
  if (cltDia || cltNoite) partes.push(c.salario_base ? `CLT R$ ${fmtR(c.salario_base)}` : "CLT");
  const v = [
    !cltDia && c.valor_dia ? `dia ${fmtR(c.valor_dia)}` : "",
    !cltNoite && c.valor_noite ? `noite ${fmtR(c.valor_noite)}` : "",
  ].filter(Boolean).join(" / ");
  if (v) partes.push(`free R$ ${v}`);
  if (c.recebe_10) partes.push("10%");
  if (c.esporadico) partes.push("free esporádico");
  if (c.faz_garcom) partes.push("garçom");
  if (c.faz_cardapio) partes.push("cardápio");
  if (((c.checklist_setores as string[] | null) ?? []).length > 0) partes.push("checklists");
  return partes.join(" · ");
}

const dataBRcurta = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

// Desligar com motivo (obrigatório) e data.
function DesligarModal({ c, onClose }: { c: Row; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState(() => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10));
  const [msg, setMsg] = useState<string | null>(null);
  const [proc, start] = useTransition();
  const inputCls = "w-full min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto outline-none focus:border-primaria";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-cartao bg-painel-cartao p-5">
        <h2 className="text-lg font-bold text-texto">Desligar {c.nome}</h2>
        <p className="mt-1 text-sm text-texto-suave">
          A pessoa sai das listas e perde o acesso ao app na hora (o link e o PIN são apagados). O histórico de pagamentos, folgas e compras fica guardado. Dá pra reativar depois.
        </p>
        <label className="mt-4 mb-1 block text-xs font-medium text-texto-suave">Data do desligamento</label>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
        <label className="mt-3 mb-1 block text-xs font-medium text-texto-suave">Motivo (obrigatório)</label>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Ex.: pediu demissão / dispensado / parou de vir…" className={inputCls} autoFocus />
        {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-controle border border-borda-forte px-4 py-2 text-sm">Cancelar</button>
          <button
            type="button"
            disabled={proc || motivo.trim().length < 3}
            onClick={() => start(async () => {
              const r = await desligarColaborador(c.id, motivo, data);
              if (!r.ok) { setMsg(r.mensagem); return; }
              onClose();
            })}
            className="rounded-controle bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {proc ? "Desligando…" : "Desligar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export type SetorChecklist = { id: string; nome: string; cor: string | null };

export function ColaboradoresClient({ rows, setoresChecklist = [] }: { rows: Row[]; setoresChecklist?: SetorChecklist[] }) {
  const [editando, setEditando] = useState<Row | null>(null);
  const [aberto, setAberto] = useState(false);
  const [verLinks, setVerLinks] = useState(false);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<"ativos" | "desligados">("ativos");
  const [desligando, setDesligando] = useState<Row | null>(null);

  const ativos = rows.filter((c) => c.ativo);
  const desligados = rows.filter((c) => !c.ativo).sort((a, b) => ((b.desligado_em ?? "") > (a.desligado_em ?? "") ? 1 : -1));
  const mesAtual = new Date().getMonth() + 1;
  const aniversariantes = ativos
    .filter((c) => c.nascimento && Number(c.nascimento.split("-")[1]) === mesAtual)
    .sort((a, b) => (a.nascimento! > b.nascimento! ? 1 : -1));
  const base = aba === "ativos" ? ativos : desligados;
  const visiveis = busca ? base.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase())) : base;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">Colaboradores</h1>
          <p className="mt-1 text-texto-suave">
            A equipe. {ativos.length} ativo{ativos.length === 1 ? "" : "s"}
            {desligados.length > 0 && (
              <> · <button type="button" onClick={() => setAba(aba === "ativos" ? "desligados" : "ativos")} className="text-texto-suave underline hover:text-orange-600">
                {aba === "ativos" ? `ver ${desligados.length} desligado${desligados.length === 1 ? "" : "s"}` : "voltar aos ativos"}
              </button></>
            )}.
            {" "}<Link href="/colaboradores/semana" className="inline-flex items-center gap-1.5 text-orange-600 hover:underline"><Icone nome="horario" tamanho={14} /> Semana e 10%</Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar…"
            className="w-36 rounded-controle border border-borda-forte bg-painel-cartao px-3 py-2 text-sm"
          />
          <button
            onClick={() => setVerLinks((v) => !v)}
            className="rounded-controle border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            <span className="inline-flex items-center gap-1.5"><Icone nome="celular" tamanho={14} /> Enviar app</span>
          </button>
          <button
            onClick={() => { setEditando(null); setAberto(true); }}
            className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90"
          >
            + Adicionar
          </button>
        </div>
      </div>

      {verLinks && (
        <div className="mb-6 rounded-cartao border border-borda p-5">
          <p className="mb-4 text-sm text-texto-suave">
            Envie o <b>app pessoal</b> (um link só por pessoa). Ela abre, cria um PIN e adiciona à tela do celular.
            Aparecem lá as contagens e/ou folgas dela.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((c) => <CardApp key={c.id} c={c} />)}
          </div>
        </div>
      )}

      {aniversariantes.length > 0 && (
        <div className="mb-6 rounded-cartao border border-pink-200 bg-pink-50/60 p-4 text-sm dark:border-pink-900 dark:bg-pink-950/20">
          <span className="inline-flex items-center gap-1.5 font-semibold"><Icone nome="bolo" tamanho={14} /> Aniversariantes do mês:</span>{" "}
          {aniversariantes.map((c) => `${c.nome} (${aniversarioBR(c.nascimento)})`).join(" · ")}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          Nenhum colaborador ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-cartao bg-painel-cartao">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-texto-fraco">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Folga / Contagem</th>
                <th className="px-4 py-3">App pessoal</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {visiveis.map((c) => (
                <tr key={c.id} className="transition hover:bg-superficie-suave">
                  <td className="px-4 py-3 font-medium text-texto">
                    {c.nome}
                    {c.nascimento && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-pink-600">
                        <Icone nome="bolo" tamanho={12} /> {aniversarioBR(c.nascimento)}
                      </span>
                    )}
                    {c.whatsapp && <div className="text-xs font-normal text-texto-fraco">{c.whatsapp}</div>}
                    <div className="text-xs font-normal text-texto-suave">{resumoQuadro(c)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-texto-suave">
                    {c.folga ? <div className="flex items-center gap-1.5" style={{ color: GRUPOS[c.folga.grupo as GrupoKey]?.cor }}><Icone nome="folga" tamanho={13} /> {resumoFolga(c.folga)}</div> : <span className="text-texto-fraco">sem folga</span>}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-texto-fraco">
                        {c.faz_contagem && <span className="inline-flex items-center gap-1"><Icone nome="pacote" tamanho={12} /> contagem</span>}
                        {c.faz_etiquetas && <span className="inline-flex items-center gap-1"><Icone nome="etiqueta" tamanho={12} /> etiquetas</span>}
                        {c.faz_contas && <span className="inline-flex items-center gap-1"><Icone nome="dinheiro" tamanho={12} /> contas</span>}
                        {c.faz_cardapio && <span className="inline-flex items-center gap-1"><Icone nome="salao" tamanho={12} /> cardápio</span>}
                      </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.ativo ? <LinkApp c={c} /> : (
                      <div className="text-xs text-texto-suave">
                        <div className="font-semibold text-red-600">Desligado em {dataBRcurta(c.desligado_em)}</div>
                        <div>{c.desligado_motivo}</div>
                        <div className="text-texto-fraco">sem acesso ao app</div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {c.ativo ? (
                      <>
                        <button
                          onClick={() => { setEditando(c); setAberto(true); }}
                          className="mr-3 text-orange-600 hover:underline"
                        >
                          Editar
                        </button>
                        <button type="button" onClick={() => setDesligando(c)} className="text-texto-fraco hover:text-red-600">Desligar</button>
                      </>
                    ) : (
                      <form action={reativarColaborador} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="text-emerald-600 hover:underline">Reativar</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberto && <EditModal editando={editando} onClose={() => setAberto(false)} setoresChecklist={setoresChecklist} />}
      {desligando && <DesligarModal c={desligando} onClose={() => setDesligando(null)} />}
    </div>
  );
}

function EditModal({ editando, onClose, setoresChecklist = [] }: { editando: Row | null; onClose: () => void; setoresChecklist?: SetorChecklist[] }) {
  const f = editando?.folga ?? null;
  const [temFolga, setTemFolga] = useState(!!f);
  const [grupo2, setGrupo2] = useState<string>(f?.grupo2 ?? "");
  const [turno, setTurno] = useState<string>(editando?.turno ?? "dia");
  const [vinc, setVinc] = useState<string>(editando?.vinculo ?? "freelance");
  const [maisDados, setMaisDados] = useState(false);

  const diaBtn = (name: string, n: number, checked: boolean) => (
    <label key={n} className="flex cursor-pointer items-center gap-1 rounded-controle border border-borda-forte px-2 py-1 text-sm">
      <input type="checkbox" name={name} value={n} defaultChecked={checked} /> {DIAS[n]}
    </label>
  );
  const lbl = "mb-1 block text-xs font-medium text-texto-suave";
  const [vincNoite, setVincNoite] = useState<string>(editando?.vinculo_noite ?? editando?.vinculo ?? "freelance");
  const temDia = turno === "dia" || turno === "ambos";
  const temNoite = turno === "noite" || turno === "ambos";
  // Pessoa "dia e noite" pode ter carteira de dia e ser free de noite.
  const cltDia = vinc === "clt";
  const cltNoite = turno === "ambos" ? vincNoite === "clt" : vinc === "clt";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-cartao bg-painel-cartao p-6">
        <h2 className="mb-4 text-lg font-semibold text-texto">
          {editando ? "Editar pessoa" : "Nova pessoa"}
        </h2>
        <form
          action={async (fd) => {
            const r = await salvarColaborador(fd);
            if (r && "erro" in r && r.erro) { window.alert(r.erro); return; }
            onClose();
          }}
          className="space-y-3"
        >
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div>
              <label className="mb-1 block text-sm font-medium text-texto-suave">Nome *</label>
              <input name="nome" required autoFocus defaultValue={editando?.nome ?? ""} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-texto-suave"><Icone nome="bolo" tamanho={14} /> Aniversário</label>
              <input name="nascimento" placeholder="dd/mm" defaultValue={aniversarioBR(editando?.nascimento)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-texto-suave">WhatsApp</label>
            <input name="whatsapp" placeholder="(51) 99999-9999" defaultValue={editando?.whatsapp ?? ""} className={inputCls} />
          </div>

          {/* Quadro / pagamento */}
          <div className="space-y-3 rounded-cartao border border-borda p-3">
            <p className="text-xs font-bold text-texto-fraco">Turno e pagamento</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className={lbl}>Turno</label>
                <select name="turno" value={turno} onChange={(e) => setTurno(e.target.value)} className={inputCls}>
                  <option value="dia">Dia</option>
                  <option value="noite">Noite</option>
                  <option value="ambos">Dia e noite</option>
                  <option value="proprietario">Proprietário</option>
                </select>
              </div>
              <div>
                <label className={`${lbl} flex items-center gap-1.5`}>{turno === "ambos" ? <><Icone nome="dia" tamanho={13} /> Vínculo de DIA</> : "Vínculo"}</label>
                <select name="vinc" value={vinc} onChange={(e) => setVinc(e.target.value)} className={inputCls}>
                  <option value="freelance">Freelance (por dia)</option>
                  <option value="clt">Carteira assinada (salário)</option>
                </select>
              </div>
              {turno === "ambos" && (
                <div>
                  <label className={`${lbl} flex items-center gap-1.5`}><Icone nome="noite" tamanho={13} /> Vínculo de NOITE</label>
                  <select name="vinc_noite" value={vincNoite} onChange={(e) => setVincNoite(e.target.value)} className={inputCls}>
                    <option value="freelance">Freelance (por noite)</option>
                    <option value="clt">Carteira assinada (salário)</option>
                  </select>
                </div>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(cltDia || cltNoite) && (
                <div>
                  <label className={lbl}>Salário (R$)</label>
                  <input name="salario_base" inputMode="decimal" placeholder="0,00" defaultValue={fmtR(editando?.salario_base)} className={inputCls} />
                </div>
              )}
              {temDia && !cltDia && (
                <div>
                  <label className={`${lbl} flex items-center gap-1.5`}><Icone nome="dia" tamanho={13} /> Valor do dia (R$)</label>
                  <input name="valor_dia" inputMode="decimal" placeholder="0,00" defaultValue={fmtR(editando?.valor_dia)} className={inputCls} />
                </div>
              )}
              {temNoite && !cltNoite && (
                <div>
                  <label className={`${lbl} flex items-center gap-1.5`}><Icone nome="noite" tamanho={13} /> Valor da noite (R$)</label>
                  <input name="valor_noite" inputMode="decimal" placeholder="0,00" defaultValue={fmtR(editando?.valor_noite)} className={inputCls} />
                </div>
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
              <label className="flex items-center gap-1 text-xs text-texto-suave" title="1 = parte igual. 0,5 = meia parte. 2 = parte dupla.">
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
                    <p className={`${lbl} flex items-center gap-1.5`}><Icone nome="dia" tamanho={13} /> Dias fixos de DIA</p>
                    <div className="flex flex-wrap gap-1">{[1, 2, 3, 4, 5, 6, 0].map((n) => diaBtn("dias_dia", n, !!editando?.dias_dia?.includes(n)))}</div>
                  </div>
                )}
                {temNoite && (
                  <div>
                    <p className={`${lbl} flex items-center gap-1.5`}><Icone nome="noite" tamanho={13} /> Noites fixas</p>
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

          <p className="pt-1 text-xs font-bold text-texto-fraco">App pessoal</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="faz_contagem" defaultChecked={editando ? editando.faz_contagem : false} /> Faz contagem de estoque
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="faz_etiquetas" defaultChecked={editando ? editando.faz_etiquetas : false} /> Faz etiquetas (gerar / dar baixa)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="faz_contas" defaultChecked={editando ? editando.faz_contas : false} /> Contas a pagar (ver boletos e dar baixa) — gerencial
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="faz_garcom" defaultChecked={editando ? !!editando.faz_garcom : false} /> <Icone nome="garcom" tamanho={14} /> Garçom (atalho &quot;Modo garçom&quot; no app: mesas, pedidos e conta)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="faz_cardapio" defaultChecked={editando ? !!editando.faz_cardapio : false} /> <Icone nome="salao" tamanho={14} /> Editar cardápio do dia (buffet, saladas e marmitas — e publicar no site/TV)
          </label>
          {setoresChecklist.length > 0 && (
            <div className="rounded-cartao border border-borda p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-texto-suave"><Icone nome="checklist" tamanho={14} /> Checklists — setores que esta pessoa executa</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {setoresChecklist.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="checklist_setor"
                      value={s.id}
                      defaultChecked={((editando?.checklist_setores as string[] | null) ?? []).includes(s.id)}
                    />
                    <span style={{ color: s.cor ?? undefined }}>{s.nome}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-texto-fraco">Sem nenhum marcado, a pessoa não vê o módulo no app.</p>
            </div>
          )}

          <label className="flex items-center gap-2 border-t border-borda pt-3 text-sm">
            <input type="checkbox" name="tem_folga" checked={temFolga} onChange={(e) => setTemFolga(e.target.checked)} /> Entra na escala de folgas
          </label>

          {temFolga && (
            <div className="space-y-3 rounded-cartao border border-borda p-3">
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
                <p className="mb-1 text-xs font-bold text-texto-fraco">Dias fixos</p>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 6].map((n) => diaBtn("dias", n, !!f?.dias?.includes(n)))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold text-texto-fraco">2º turno (opcional)</p>
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
            <button type="button" onClick={onClose} className="rounded-controle px-4 py-2 text-sm text-texto-suave hover:bg-superficie-suave dark:text-texto-fraco">
              Cancelar
            </button>
            <button type="submit" className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
