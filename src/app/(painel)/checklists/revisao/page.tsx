import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import * as core from "@/lib/checklists-core";
import { RevisaoClient, type ListaRevisao } from "./revisao-client";

export const metadata = { title: "Revisar checklists · Brasa" };
export const dynamic = "force-dynamic";

// Revisão do dia: abre no dia anterior, mostra o que ficou pendente e deixa
// apontar correções que vão pra TV da cozinha.
export default async function RevisaoPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const sp = await searchParams;
  const hoje = core.hojeSP();
  const dia = core.diaValido(sp.dia ?? "") ? sp.dia! : core.addDiasIso(hoje, -1);
  const supabase = await createClient();
  const db = supabase as unknown as core.Db;

  const [setores, modelos, { data: apRows }] = await Promise.all([
    core.listarSetores(db, true),
    core.listarModelos(db, true),
    supabase
      .from("checklist_apontamentos")
      .select("*")
      .or(`data_ref.eq.${dia},and(na_tv.eq.true,resolvido_em.is.null)`)
      .order("criado_em", { ascending: false }),
  ]);
  const valem = modelos.filter((m) => core.valeNoDia(m, dia));
  const [itens, execs] = await Promise.all([
    core.listarItens(db, valem.map((m) => m.id)),
    core.execucoesDoDia(db, dia),
  ]);
  const respostas = await core.respostasDe(db, execs.map((e) => e.id));

  const listas: ListaRevisao[] = valem
    .map((m) => {
      const exec = execs.find((e) => e.modelo_id === m.id) ?? null;
      const meus = itens.filter((i) => i.modelo_id === m.id);
      const resp = exec ? respostas.filter((r) => r.execucao_id === exec.id) : [];
      const s = setores.find((x) => x.id === m.setor_id);
      return {
        modelo: m, setor: s?.nome ?? "—", setorId: m.setor_id, cor: s?.cor ?? null,
        itens: meus, execucao: exec, respostas: resp, situacao: core.situacao(meus, resp, exec),
      };
    })
    .sort((a, b) => a.setor.localeCompare(b.setor) || core.MOMENTOS.indexOf(a.modelo.momento) - core.MOMENTOS.indexOf(b.modelo.momento));

  const apontamentos = (apRows as core.Apontamento[]) ?? [];

  return (
    <div className="w-full p-8">
      <Link href="/checklists" className="text-sm text-texto-suave hover:text-orange-600">← Checklists de hoje</Link>
      <RevisaoClient
        dia={dia}
        hoje={hoje}
        listas={listas}
        setores={setores.filter((s) => s.ativo).map((s) => ({ id: s.id, nome: s.nome, cor: s.cor }))}
        apontamentos={apontamentos}
      />
    </div>
  );
}
