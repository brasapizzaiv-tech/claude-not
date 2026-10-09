"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";
import { Enviar, BotaoAcao } from "@/components/enviar";
import { confirmar } from "@/components/dialogo";
import { NOME_DIA, type Lembrete, type Repeticao } from "@/lib/lembretes-core";
import { apagarLembrete, ligarLembrete, salvarLembrete } from "./actions";

export type LinhaLembrete = {
  lembrete: Lembrete;
  quando: string;
  para: string;
  situacao: { dia: string; confirmados: { nome: string; em: string }[]; pendentes: string[] } | null;
  futuro: boolean;
};

const CAMPO = "min-h-11 w-full rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";
const ROTULO = "mb-1 block text-xs text-texto-suave";
const CHIP = "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-600 has-[:checked]:text-white border-borda-forte text-texto-suave";
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const fHora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function LembretesClient({ linhas, hoje, setores, pessoas }: {
  linhas: LinhaLembrete[];
  hoje: string;
  setores: { id: string; nome: string }[];
  pessoas: { id: string; nome: string; usaApp: boolean }[];
}) {
  const [editando, setEditando] = useState<Lembrete | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const formAberto = abrindo || editando !== null;

  const deHoje = linhas.filter((x) => x.situacao);
  const programados = linhas.filter((x) => !x.situacao && x.lembrete.ativo && (x.futuro || x.lembrete.repeticao !== "uma_vez"));
  const resto = linhas.filter((x) => !deHoje.includes(x) && !programados.includes(x));

  function fechar() { setAbrindo(false); setEditando(null); setErro(null); }

  return (
    <div className="flex flex-col gap-6">
      {!formAberto ? (
        <div>
          <button onClick={() => setAbrindo(true)} className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo hover:opacity-90">
            <span className="inline-flex items-center gap-2"><Icone nome="novo" tamanho={16} /> Novo lembrete</span>
          </button>
        </div>
      ) : (
        <Formulario
          key={editando?.id ?? "novo"}
          inicial={editando}
          hoje={hoje}
          setores={setores}
          pessoas={pessoas}
          erro={erro}
          aoSalvar={async (fd) => {
            const r = await salvarLembrete(fd);
            if (!r.ok) setErro(r.erro); else fechar();
          }}
          aoCancelar={fechar}
        />
      )}

      <Secao titulo="Hoje" vazio="Nenhum lembrete pra hoje.">
        {deHoje.map((x) => <Cartao key={x.lembrete.id} x={x} editar={() => { setEditando(x.lembrete); setAbrindo(false); }} />)}
      </Secao>
      {programados.length > 0 && (
        <Secao titulo="Programados">
          {programados.map((x) => <Cartao key={x.lembrete.id} x={x} editar={() => { setEditando(x.lembrete); setAbrindo(false); }} />)}
        </Secao>
      )}
      {resto.length > 0 && (
        <Secao titulo="Já passaram ou desligados">
          {resto.map((x) => <Cartao key={x.lembrete.id} x={x} editar={() => { setEditando(x.lembrete); setAbrindo(false); }} />)}
        </Secao>
      )}
    </div>
  );
}

function Secao({ titulo, vazio, children }: { titulo: string; vazio?: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h2 className="mb-2 font-semibold text-texto">{titulo}</h2>
      {children.length ? <div className="flex flex-col gap-2">{children}</div> : <p className="text-sm text-texto-fraco">{vazio}</p>}
    </section>
  );
}

function Cartao({ x, editar }: { x: LinhaLembrete; editar: () => void }) {
  const l = x.lembrete;
  const s = x.situacao;
  const total = s ? s.confirmados.length + s.pendentes.length : 0;
  return (
    <div className={`rounded-cartao bg-painel-cartao p-4 ${l.ativo ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-texto">{l.titulo}</p>
          {l.texto && <p className="mt-0.5 whitespace-pre-wrap text-sm text-texto-suave">{l.texto}</p>}
          <p className="mt-1 text-xs text-texto-fraco">
            {x.quando} · {x.para} · {l.tipo === "tarefa" ? "pede Feito" : "pede Visto"}{!l.ativo ? " · desligado" : ""}
          </p>
        </div>
        {s && (
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${s.pendentes.length === 0 && total > 0 ? "bg-emerald-600 text-white" : "bg-superficie-suave text-texto"}`}>
            {s.confirmados.length} de {total}
          </span>
        )}
      </div>
      {s && total > 0 && (
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-texto-suave">Falta {l.tipo === "tarefa" ? "fazer" : "ver"}</p>
            <p className={s.pendentes.length ? "text-amber-700 dark:text-amber-400" : "text-texto-fraco"}>{s.pendentes.join(", ") || "ninguém"}</p>
          </div>
          <div>
            <p className="text-xs text-texto-suave">{l.tipo === "tarefa" ? "Fizeram" : "Viram"}</p>
            <p className="text-texto">{s.confirmados.map((c) => `${c.nome} ${fHora(c.em)}`).join(", ") || "ninguém ainda"}</p>
          </div>
        </div>
      )}
      {s && total === 0 && <p className="mt-2 text-sm text-texto-fraco">Ninguém desse grupo usa o app ainda.</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <button onClick={editar} className="min-h-9 rounded-controle border border-borda-forte px-3">Mudar</button>
        <BotaoAcao aoClicar={() => ligarLembrete(l.id, !l.ativo)} className="min-h-9 rounded-controle border border-borda-forte px-3">
          {l.ativo ? "Desligar" : "Ligar de novo"}
        </BotaoAcao>
        <BotaoAcao
          aoClicar={async () => { if (await confirmar("Apagar este lembrete?", { detalhe: "Some também o registro de quem viu.", perigo: true, okTexto: "Apagar" })) await apagarLembrete(l.id); }}
          className="min-h-9 rounded-controle px-3 text-red-600"
        >
          Apagar
        </BotaoAcao>
      </div>
    </div>
  );
}

function Formulario({ inicial, hoje, setores, pessoas, erro, aoSalvar, aoCancelar }: {
  inicial: Lembrete | null; hoje: string;
  setores: { id: string; nome: string }[]; pessoas: { id: string; nome: string; usaApp: boolean }[];
  erro: string | null; aoSalvar: (fd: FormData) => Promise<void>; aoCancelar: () => void;
}) {
  const [para, setPara] = useState<Lembrete["para"]>(inicial?.para ?? "todos");
  const [repeticao, setRepeticao] = useState<Repeticao>(inicial?.repeticao ?? "uma_vez");

  return (
    <form action={aoSalvar} className="flex flex-col gap-4 rounded-cartao bg-painel-cartao p-4">
      <input type="hidden" name="id" value={inicial?.id ?? ""} />
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-texto">{inicial ? "Mudar o lembrete" : "Novo lembrete"}</p>
        <button type="button" onClick={aoCancelar} className="text-xs text-texto-fraco hover:underline">cancelar</button>
      </div>

      <div>
        <label className={ROTULO}>Lembrete</label>
        <input name="titulo" required maxLength={120} defaultValue={inicial?.titulo ?? ""} placeholder="Ex.: Reunião da equipe às 15h" className={CAMPO} />
      </div>
      <div>
        <label className={ROTULO}>Detalhe (opcional)</label>
        <textarea name="texto" rows={2} maxLength={1000} defaultValue={inicial?.texto ?? ""} className={`${CAMPO} py-2`} />
      </div>

      <div>
        <span className={ROTULO}>A pessoa responde</span>
        <div className="flex flex-wrap gap-2">
          <label className={CHIP}><input type="radio" name="tipo" value="aviso" defaultChecked={(inicial?.tipo ?? "aviso") === "aviso"} className="sr-only" /> Visto (é um aviso)</label>
          <label className={CHIP}><input type="radio" name="tipo" value="tarefa" defaultChecked={inicial?.tipo === "tarefa"} className="sr-only" /> Feito (é uma tarefa)</label>
        </div>
      </div>

      <div>
        <span className={ROTULO}>Pra quem</span>
        <div className="flex flex-wrap gap-2">
          {(["todos", "setores", "pessoas"] as const).map((p) => (
            <label key={p} className={CHIP}>
              <input type="radio" name="para" value={p} checked={para === p} onChange={() => setPara(p)} className="sr-only" />
              {p === "todos" ? "Todos" : p === "setores" ? "Setores" : "Pessoas"}
            </label>
          ))}
        </div>
        {para === "setores" && (
          <div className="mt-2 flex flex-wrap gap-2">
            {setores.map((s) => (
              <label key={s.id} className={CHIP}><input type="checkbox" name="setor_ids" value={s.id} defaultChecked={inicial?.setorIds.includes(s.id)} className="sr-only" /> {s.nome}</label>
            ))}
            {setores.length === 0 && <p className="text-sm text-texto-fraco">Nenhum setor cadastrado (Checklists, setores).</p>}
          </div>
        )}
        {para === "pessoas" && (
          <div className="mt-2 flex flex-wrap gap-2">
            {pessoas.map((p) => (
              <label key={p.id} className={CHIP} title={p.usaApp ? undefined : "Ainda não entrou no app"}>
                <input type="checkbox" name="colaborador_ids" value={p.id} defaultChecked={inicial?.colaboradorIds.includes(p.id)} className="sr-only" /> {p.nome}{p.usaApp ? "" : " *"}
              </label>
            ))}
          </div>
        )}
        {para === "pessoas" && pessoas.some((p) => !p.usaApp) && <p className="mt-1 text-xs text-texto-fraco">* ainda não entrou no app, então não vai ver.</p>}
        {para === "setores" && <p className="mt-1 text-xs text-texto-fraco">Setor de cada pessoa: Colaboradores, editar, Checklists.</p>}
      </div>

      <div>
        <span className={ROTULO}>Quando</span>
        <div className="flex flex-wrap gap-2">
          {(["uma_vez", "diario", "semanal", "mensal"] as const).map((r) => (
            <label key={r} className={CHIP}>
              <input type="radio" name="repeticao" value={r} checked={repeticao === r} onChange={() => setRepeticao(r)} className="sr-only" />
              {r === "uma_vez" ? "Uma vez" : r === "diario" ? "Todo dia" : r === "semanal" ? "Dias da semana" : "Todo mês"}
            </label>
          ))}
        </div>
        {repeticao === "semanal" && (
          <div className="mt-2 flex flex-wrap gap-2">
            {ORDEM_SEMANA.map((d) => (
              <label key={d} className={CHIP}><input type="checkbox" name="dias" value={d} defaultChecked={inicial?.dias.includes(d)} className="sr-only" /> {NOME_DIA[d]}</label>
            ))}
          </div>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div>
            <label className={ROTULO}>{repeticao === "uma_vez" ? "Dia" : "A partir de"}</label>
            <input type="date" name="data" required defaultValue={inicial?.data ?? hoje} className={CAMPO} />
          </div>
          {repeticao === "mensal" && (
            <div>
              <label className={ROTULO}>Dia do mês</label>
              <input type="number" name="dia_mes" min={1} max={31} defaultValue={inicial?.diaMes ?? ""} className={CAMPO} />
            </div>
          )}
          {repeticao !== "uma_vez" && (
            <div>
              <label className={ROTULO}>Até (opcional)</label>
              <input type="date" name="ate" defaultValue={inicial?.ate ?? ""} className={CAMPO} />
            </div>
          )}
          <div>
            <label className={ROTULO}>Hora (opcional)</label>
            <input type="time" name="hora" defaultValue={inicial?.hora ?? ""} className={CAMPO} />
          </div>
        </div>
        {repeticao === "uma_vez" && <p className="mt-1 text-xs text-texto-fraco">Quem não confirmar no dia continua vendo por até 7 dias.</p>}
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div>
        <Enviar className="min-h-11 rounded-controle bg-texto px-5 text-sm font-semibold text-fundo">{inicial ? "Salvar" : "Criar lembrete"}</Enviar>
      </div>
    </form>
  );
}
