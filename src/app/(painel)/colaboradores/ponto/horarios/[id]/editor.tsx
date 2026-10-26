"use client";

// Editar horário (migration 0255): a semana em tabela, como no RHiD.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { avisar, confirmar } from "@/components/dialogo";
import { duracao } from "@/lib/ponto-relatorio-core";
import { minutosDoDia, ORDEM_DIAS, type HorarioPonto } from "@/lib/ponto-horarios-core";
import { apagarHorario, definirHorarioPessoa, salvarHorario } from "../actions";

type Linha = { e1: string; s1: string; e2: string; s2: string; almoco_livre: boolean; compensado: boolean; neutro: boolean };
const NOMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const CAMPO = "min-h-11 w-full rounded-controle border border-borda-forte bg-painel-cartao px-2 text-sm text-texto";
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function paraLinhas(h: HorarioPonto): Record<number, Linha> {
  const out: Record<number, Linha> = {};
  for (let dow = 0; dow <= 6; dow++) {
    const d = h.dias[String(dow)];
    const p = d?.p ?? [];
    out[dow] = { e1: p[0]?.[0] ?? "", s1: p[0]?.[1] ?? "", e2: p[1]?.[0] ?? "", s2: p[1]?.[1] ?? "", almoco_livre: !!d?.almoco_livre, compensado: !!d?.compensado, neutro: !!d?.neutro };
  }
  return out;
}
const periodos = (l: Linha): [string, string][] => [[l.e1, l.s1], [l.e2, l.s2]].filter(([e, s]) => e || s) as [string, string][];

export function EditorHorario({ inicial }: { inicial: HorarioPonto }) {
  const router = useRouter();
  const [nome, setNome] = useState(inicial.nome);
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [linhas, setLinhas] = useState(() => paraLinhas(inicial));
  const [tol, setTol] = useState({ tolerancia_extra: inicial.tolerancia_extra, tolerancia_falta: inicial.tolerancia_falta, limite_extra: inicial.limite_extra, limite_falta: inicial.limite_falta });
  const [noturno, setNoturno] = useState({ noturno_inicio: inicial.noturno_inicio, noturno_fim: inicial.noturno_fim });

  const mudar = (dow: number, campo: keyof Linha, v: string | boolean) => setLinhas((ls) => ({ ...ls, [dow]: { ...ls[dow], [campo]: v } }));
  const totalDia = (l: Linha) => minutosDoDia({ p: periodos(l).filter(([e, s]) => e && s) });
  const totalSemana = ORDEM_DIAS.reduce((t, d) => t + totalDia(linhas[d]), 0);

  async function salvar() {
    const dias = Object.fromEntries(ORDEM_DIAS.map((d) => [String(d), { p: periodos(linhas[d]), almoco_livre: linhas[d].almoco_livre, compensado: linhas[d].compensado, neutro: linhas[d].neutro }]));
    const r = await salvarHorario({ id: inicial.id || undefined, nome, ativo, dias, ...tol, ...noturno });
    if (!r.ok) { void avisar(r.erro); return; }
    if (!inicial.id) router.replace(`/colaboradores/ponto/horarios/${r.id}`);
    else { void avisar("Horário salvo.", "O espelho de quem está nele já usa o horário novo."); router.refresh(); }
  }
  async function apagar() {
    if (!(await confirmar(`Apagar o horário “${inicial.nome}”?`, { detalhe: "Se alguém já usou esse horário, ele só fica inativo (o histórico continua).", perigo: true, okTexto: "Apagar" }))) return;
    const r = await apagarHorario(inicial.id);
    if (!r.ok) { void avisar(r.erro); return; }
    router.replace("/colaboradores/ponto/horarios");
  }

  const num = (k: keyof typeof tol, rotulo: string, ajuda: string) => (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-texto">{rotulo}</span>
      <input type="number" min={0} max={120} inputMode="numeric" value={tol[k]} onChange={(e) => setTol((t) => ({ ...t, [k]: Number(e.target.value) }))} className={`${CAMPO} max-w-28`} />
      <span className="mt-1 block text-xs text-texto-suave">{ajuda}</span>
    </label>
  );

  return (
    <div className="mt-4 grid gap-4">
      <section className="cartao grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-texto">Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Horário Restaurante" className={CAMPO} />
        </label>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm text-texto">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-5 w-5" /> Ativo
        </label>
      </section>

      <section className="cartao overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="rotulo text-left">
            <tr>
              <th className="px-4 py-3">Dia</th><th className="px-1 py-3">Entrada 1</th><th className="px-1 py-3">Saída 1</th><th className="px-1 py-3">Entrada 2</th><th className="px-1 py-3">Saída 2</th>
              <th className="px-2 py-3 text-right">Total</th>
              <th className="px-2 py-3 text-center" title="O intervalo pode ser em qualquer hora: vale quanto tempo parou.">Almoço livre</th>
              <th className="px-2 py-3 text-center" title="Não trabalha (compensou em outro dia). Quem vem faz extra.">Compensado</th>
              <th className="px-2 py-3 text-center" title="Nada conta nesse dia: nem falta, nem extra.">Neutro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {ORDEM_DIAS.map((dow) => {
              const l = linhas[dow];
              const hora = (k: "e1" | "s1" | "e2" | "s2") => (
                <td className="px-1 py-1.5"><input type="time" aria-label={`${NOMES[dow]} ${k}`} value={l[k]} onChange={(e) => mudar(dow, k, e.target.value)} className={`${CAMPO} min-w-[6.5rem]`} /></td>
              );
              const caixa = (k: "almoco_livre" | "compensado" | "neutro") => (
                <td className="px-2 py-1.5 text-center"><input type="checkbox" aria-label={`${NOMES[dow]} ${k}`} checked={l[k]} onChange={(e) => mudar(dow, k, e.target.checked)} className="h-5 w-5" /></td>
              );
              const t = totalDia(l);
              return (
                <tr key={dow}>
                  <td className="px-4 py-1.5 font-semibold text-texto">{NOMES[dow]}</td>
                  {hora("e1")}{hora("s1")}{hora("e2")}{hora("s2")}
                  <td className="px-2 py-1.5 text-right font-numero font-semibold text-texto">{t ? duracao(t) : <span className="text-texto-fraco">folga</span>}</td>
                  {caixa("almoco_livre")}{caixa("compensado")}{caixa("neutro")}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-borda-forte"><td className="px-4 py-2 font-semibold text-texto" colSpan={5}>Total da semana</td><td className="px-2 py-2 text-right font-numero font-bold text-texto">{duracao(totalSemana)}</td><td colSpan={3}></td></tr>
          </tfoot>
        </table>
        <p className="px-4 pb-3 text-xs text-texto-suave">Dia sem horário = folga. Saída menor que a entrada passa da meia-noite (ex.: 18:00 às 00:30).</p>
      </section>

      <section className="cartao grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <p className="rotulo sm:col-span-2 lg:col-span-4">Tolerâncias (CLT art. 58)</p>
        {num("tolerancia_extra", "Extra por batida (min)", "Até isso antes ou depois do horário não conta como extra.")}
        {num("tolerancia_falta", "Falta por batida (min)", "Atraso ou saída antes até isso não conta.")}
        {num("limite_extra", "Limite diário de extra (min)", "Se as extras do dia passarem disso, contam todas.")}
        {num("limite_falta", "Limite diário de falta (min)", "Se as faltas do dia passarem disso, contam todas.")}
      </section>

      <section className="cartao grid gap-4 p-4 sm:grid-cols-3">
        <p className="rotulo sm:col-span-3">Horário noturno</p>
        <label className="block text-sm"><span className="mb-1 block font-semibold text-texto">Começa</span>
          <input type="time" value={noturno.noturno_inicio} onChange={(e) => setNoturno((n) => ({ ...n, noturno_inicio: e.target.value }))} className={`${CAMPO} max-w-36`} /></label>
        <label className="block text-sm"><span className="mb-1 block font-semibold text-texto">Termina</span>
          <input type="time" value={noturno.noturno_fim} onChange={(e) => setNoturno((n) => ({ ...n, noturno_fim: e.target.value }))} className={`${CAMPO} max-w-36`} /></label>
        <p className="self-end text-xs text-texto-suave">A hora noturna vale 52:30 (CLT). O espelho mostra as horas trabalhadas nesse horário.</p>
      </section>

      <div className="flex flex-wrap gap-2">
        <BotaoAcao aoClicar={salvar} className="btn-principal">Salvar</BotaoAcao>
        <Link href="/colaboradores/ponto/horarios" className="btn-secundario">Voltar</Link>
        {inicial.id && <Link href={`/colaboradores/ponto/horarios/novo?copiar=${inicial.id}`} className="btn-secundario">Copiar horário</Link>}
        {inicial.id && <BotaoAcao aoClicar={apagar} className="btn-secundario ml-auto text-urgente-texto">Apagar</BotaoAcao>}
      </div>
    </div>
  );
}

export type VinculoTela = { id: string; colaboradorId: string; nome: string; ativo: boolean; de: string; ate: string | null };

/** Aba "Funcionários" do horário: quem está nele (e esteve), e colocar alguém a partir de uma data. */
export function PessoasDoHorario({ horarioId, vinculos, pessoas, hoje }: { horarioId: string; vinculos: VinculoTela[]; pessoas: { id: string; nome: string }[]; hoje: string }) {
  const router = useRouter();
  const [pessoa, setPessoa] = useState("");
  const [de, setDe] = useState(hoje);
  async function colocar() {
    if (!pessoa) { void avisar("Escolha a pessoa."); return; }
    const nome = pessoas.find((p) => p.id === pessoa)?.nome ?? "";
    if (!(await confirmar(`Colocar ${nome} neste horário a partir de ${dm(de)}?`, { detalhe: "O horário de antes vale até o dia anterior. Os dias antes dessa data não mudam.", okTexto: "Colocar" }))) return;
    const r = await definirHorarioPessoa(pessoa, horarioId, de);
    if (!r.ok) { void avisar(r.erro); return; }
    setPessoa("");
    router.refresh();
  }
  return (
    <section className="cartao mt-4 p-4">
      <p className="rotulo mb-2">Funcionários neste horário</p>
      <ul className="divide-y divide-borda text-sm">
        {vinculos.map((v) => {
          const atual = !v.ate || v.ate >= hoje;
          return (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className={atual && v.ativo ? "font-semibold text-texto" : "text-texto-suave"}>{v.nome}{!v.ativo && " (desligado)"}</span>
              <span className="text-texto-suave">de {dm(v.de)} {v.ate ? `até ${dm(v.ate)}` : "em diante"}</span>
            </li>
          );
        })}
        {vinculos.length === 0 && <li className="py-2 text-texto-suave">Ninguém ainda.</li>}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-borda pt-3">
        <label className="block text-sm"><span className="mb-1 block font-semibold text-texto">Colocar neste horário</span>
          <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className={`${CAMPO} min-w-[220px]`}>
            <option value="">Escolha a pessoa…</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label className="block text-sm"><span className="mb-1 block font-semibold text-texto">A partir de</span>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={`${CAMPO} max-w-44`} /></label>
        <BotaoAcao aoClicar={colocar} className="btn-principal">Colocar</BotaoAcao>
      </div>
      <p className="mt-2 text-xs text-texto-suave">Só aparece quem está marcado “Bate ponto no relógio” em Colaboradores.</p>
    </section>
  );
}
