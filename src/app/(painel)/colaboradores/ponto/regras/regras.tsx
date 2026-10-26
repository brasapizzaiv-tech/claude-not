"use client";

// Edição dos tipos de justificativa e das regras de inconsistência (migration 0258).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { avisar } from "@/components/dialogo";
import type { TipoJustificativa } from "@/lib/ponto-dados";
import type { RegraInconsistencia } from "@/lib/ponto-relatorio-core";
import { salvarInconsistencias, salvarTipoJustificativa } from "../actions";

const CAMPO = "min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-2 text-sm text-texto";
const EFEITOS: Record<string, string> = {
  dia: "Abona o dia inteiro",
  horas: "Abona horas de falta",
  ajuste: "Soma ou tira horas",
};

export function TiposJustificativa({ tipos }: { tipos: TipoJustificativa[] }) {
  const router = useRouter();
  const [novo, setNovo] = useState({ nome: "", efeito: "dia", tira_premio: false });
  async function salvar(t: { id?: string; nome: string; efeito: string; tira_premio: boolean; ativo: boolean }) {
    const r = await salvarTipoJustificativa(t);
    if (!r.ok) { void avisar(r.erro); return false; }
    router.refresh();
    return true;
  }
  return (
    <section className="cartao p-4">
      <p className="rotulo mb-1">Tipos de justificativa</p>
      <p className="mb-3 text-xs text-texto-suave">Aparecem no “justificar” do espelho. “Tira o prêmio” = perde o prêmio assiduidade do mês.</p>
      <ul className="divide-y divide-borda text-sm">
        {tipos.map((t) => (
          <li key={t.id} className={`grid grid-cols-[1fr_auto] items-center gap-2 py-2 ${t.ativo ? "" : "opacity-60"}`}>
            <span>
              <span className="font-semibold text-texto">{t.nome}</span>
              <span className="block text-xs text-texto-suave">{EFEITOS[t.efeito]}{t.tira_premio ? " · tira o prêmio" : ""}{t.ativo ? "" : " · desativado"}</span>
            </span>
            <span className="flex gap-1">
              <BotaoAcao aoClicar={() => salvar({ ...t, tira_premio: !t.tira_premio })} className="min-h-11 px-2 text-xs text-texto-marca hover:underline">{t.tira_premio ? "não tira prêmio" : "tira prêmio"}</BotaoAcao>
              <BotaoAcao aoClicar={() => salvar({ ...t, ativo: !t.ativo })} className="min-h-11 px-2 text-xs text-texto-fraco hover:text-texto">{t.ativo ? "desativar" : "ativar"}</BotaoAcao>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid gap-2 border-t border-borda pt-3 sm:grid-cols-[1fr_auto]">
        <input value={novo.nome} onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} placeholder="Novo tipo (ex.: Doação de sangue)" aria-label="Nome do novo tipo" className={CAMPO} />
        <select value={novo.efeito} onChange={(e) => setNovo((n) => ({ ...n, efeito: e.target.value }))} aria-label="O que faz" className={CAMPO}>
          {Object.entries(EFEITOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex min-h-11 items-center gap-2 text-sm text-texto"><input type="checkbox" checked={novo.tira_premio} onChange={(e) => setNovo((n) => ({ ...n, tira_premio: e.target.checked }))} className="h-5 w-5" /> Tira o prêmio</label>
        <BotaoAcao aoClicar={async () => { if (await salvar({ ...novo, ativo: true })) setNovo({ nome: "", efeito: "dia", tira_premio: false }); }} disabled={!novo.nome.trim()} className="btn-principal !min-h-11 text-sm">Adicionar</BotaoAcao>
      </div>
    </section>
  );
}

const CAMPOS: Record<RegraInconsistencia["campo"], string> = {
  falta: "Dia sem batida (falta)",
  atraso: "Falta e atraso do dia (min)",
  extra: "Extra do dia (min)",
  incompleto: "Batida faltando",
};

export function RegrasInconsistencia({ regras }: { regras: RegraInconsistencia[] }) {
  const router = useRouter();
  const [lista, setLista] = useState(regras);
  const muda = (i: number, o: Partial<RegraInconsistencia>) => setLista((l) => l.map((r, j) => (j === i ? { ...r, ...o } : r)));
  async function salvar() {
    const r = await salvarInconsistencias(lista);
    if (!r.ok) { void avisar(r.erro); return; }
    void avisar("Regras salvas.");
    router.refresh();
  }
  return (
    <section className="cartao p-4">
      <p className="rotulo mb-1">Tipos de inconsistência</p>
      <p className="mb-3 text-xs text-texto-suave">O que marca um dia como “tem problema” no espelho, no Ponto diário e no “só inconsistências”.</p>
      <ul className="divide-y divide-borda text-sm">
        {lista.map((r, i) => (
          <li key={i} className="grid gap-2 py-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <span>
              <input value={r.nome} onChange={(e) => muda(i, { nome: e.target.value })} aria-label="Nome" className={`${CAMPO} w-full font-semibold`} />
              <span className="mt-0.5 block text-xs text-texto-suave">{CAMPOS[r.campo]}</span>
            </span>
            {(r.campo === "atraso" || r.campo === "extra") ? (
              <label className="flex items-center gap-1 text-xs text-texto-suave">a partir de
                <input type="number" min={1} max={600} value={r.a_partir} onChange={(e) => muda(i, { a_partir: Number(e.target.value) })} aria-label="A partir de (min)" className={`${CAMPO} w-20 text-right`} /> min
              </label>
            ) : <span />}
            <label className="flex min-h-11 items-center gap-2 text-sm text-texto"><input type="checkbox" checked={r.ativo} onChange={(e) => muda(i, { ativo: e.target.checked })} className="h-5 w-5" /> ativa</label>
          </li>
        ))}
      </ul>
      <BotaoAcao aoClicar={salvar} className="btn-principal mt-3">Salvar regras</BotaoAcao>
    </section>
  );
}
