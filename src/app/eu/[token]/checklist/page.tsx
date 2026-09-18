import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import * as core from "@/lib/checklists-core";
import { colabChecklist } from "./actions";
import { ChecklistApp, type ListaApp } from "./checklist-app";

export const metadata = { title: "Checklists · Brasa" };
export const dynamic = "force-dynamic";

// Checklists do dia pelo app da equipe. Só abre pra quem tem setor atribuído e
// entrou com o PIN — conferido no servidor, aqui e em cada ação.
export default async function ChecklistColabPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ dia?: string }>;
}) {
  const { token } = await params;
  const { dia: diaParam = "" } = await searchParams;
  const colab = await colabChecklist(token);

  if (!colab) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-zinc-500">Esta tela é só pra quem tem um setor de checklist liberado — ou entre com o PIN de novo.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-block text-sm text-orange-600">← Voltar</Link>
      </div>
    );
  }

  const dia = core.diaValido(diaParam) ? diaParam : core.hojeSP();
  const db = createAdminClient() as core.Db;
  const [setores, modelos] = await Promise.all([core.listarSetores(db), core.listarModelos(db)]);

  // Só os setores da pessoa, só o que vale no dia.
  const meus = modelos.filter((m) => colab.setores.includes(m.setor_id) && core.valeNoDia(m, dia));
  const itens = await core.listarItens(db, meus.map((m) => m.id));
  const execs = await core.execucoesDoDia(db, dia);
  const respostas = await core.respostasDe(db, execs.map((e) => e.id));

  const nomeSetor = new Map(setores.map((s) => [s.id, s.nome]));
  const corSetor = new Map(setores.map((s) => [s.id, s.cor]));
  const listas: ListaApp[] = meus
    .map((m) => {
      const exec = execs.find((e) => e.modelo_id === m.id) ?? null;
      const meusItens = itens.filter((i) => i.modelo_id === m.id);
      const minhasResp = exec ? respostas.filter((r) => r.execucao_id === exec.id) : [];
      return {
        modelo: m,
        setor: nomeSetor.get(m.setor_id) ?? "—",
        cor: corSetor.get(m.setor_id) ?? null,
        itens: meusItens,
        execucao: exec,
        respostas: minhasResp,
        situacao: core.situacao(meusItens, minhasResp, exec),
      };
    })
    .sort((a, b) => core.MOMENTOS.indexOf(a.modelo.momento) - core.MOMENTOS.indexOf(b.modelo.momento) || a.setor.localeCompare(b.setor));

  return (
    <div className="mx-auto min-h-screen max-w-md bg-zinc-50 p-4 pb-24 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <Link href={`/eu/${token}`} className="text-sm text-zinc-500">← Voltar</Link>
        <span className="text-xs text-zinc-400">{colab.nome.split(" ")[0]}</span>
      </div>
      <ChecklistApp token={token} dia={dia} listas={listas} momentoAgora={core.momentoAgora()} />
    </div>
  );
}
