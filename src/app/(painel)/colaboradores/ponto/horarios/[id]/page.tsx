import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { hojeSP } from "@/lib/assiduidade-server";
import type { HorarioPonto } from "@/lib/ponto-horarios-core";
import { EditorHorario, PessoasDoHorario, type VinculoTela } from "./editor";

export const metadata = { title: "Editar horário · Ponto" };
export const dynamic = "force-dynamic";

const NOVO: Omit<HorarioPonto, "id"> = {
  nome: "", ativo: true, dias: {}, tolerancia_extra: 5, tolerancia_falta: 5, limite_extra: 10, limite_falta: 10, noturno_inicio: "22:00", noturno_fim: "05:00",
};

// EDITAR HORÁRIO (migration 0255): a tabela da semana (Entrada 1, Saída 1,
// Entrada 2, Saída 2, almoço livre, compensado, neutro), as tolerâncias, o
// noturno e quem está no horário (com o histórico), como as abas do RHiD.
export default async function EditarHorarioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ copiar?: string }> }) {
  await exigirAcesso("/colaboradores");
  const { id } = await params;
  const { copiar } = await searchParams;
  const supabase = await createClient();
  const campos = "id, nome, ativo, dias, tolerancia_extra, tolerancia_falta, limite_extra, limite_falta, noturno_inicio, noturno_fim";
  let horario: HorarioPonto | null = null;
  if (id !== "novo") {
    const { data } = await supabase.from("ponto_horarios").select(campos).eq("id", id).maybeSingle();
    if (!data) notFound();
    horario = data as HorarioPonto;
  } else if (copiar) {
    const { data } = await supabase.from("ponto_horarios").select(campos).eq("id", copiar).maybeSingle();
    if (data) horario = { ...(data as HorarioPonto), id: "", nome: `${(data as HorarioPonto).nome} (cópia)` };
  }

  let vinculos: VinculoTela[] = [];
  let pessoas: { id: string; nome: string }[] = [];
  if (horario?.id) {
    const [{ data: vs }, { data: cs }] = await Promise.all([
      supabase.from("colaborador_horarios").select("id, de, ate, colaborador_id, colaboradores(nome, ativo)").eq("horario_id", horario.id).order("de", { ascending: false }),
      supabase.from("colaboradores").select("id, nome").eq("ativo", true).eq("bate_ponto", true).order("nome"),
    ]);
    type V = { id: string; de: string; ate: string | null; colaborador_id: string; colaboradores: { nome: string; ativo: boolean } | { nome: string; ativo: boolean }[] | null };
    vinculos = ((vs ?? []) as V[]).map((v) => {
      const c = Array.isArray(v.colaboradores) ? v.colaboradores[0] : v.colaboradores;
      return { id: v.id, colaboradorId: v.colaborador_id, nome: c?.nome ?? "?", ativo: !!c?.ativo, de: String(v.de).slice(0, 10), ate: v.ate ? String(v.ate).slice(0, 10) : null };
    });
    pessoas = (cs ?? []) as { id: string; nome: string }[];
  }

  return (
    <div className="w-full max-w-6xl px-4 py-5 md:px-[30px] md:py-[26px]">
      <p className="rotulo">
        <Link href="/colaboradores/ponto" className="hover:text-texto">Relatórios de ponto</Link> ·{" "}
        <Link href="/colaboradores/ponto/horarios" className="hover:text-texto">Horários</Link>
      </p>
      <h1 className="mt-1 font-numero text-[30px] font-bold leading-[1.05] tracking-apertada text-texto">
        {horario?.id ? horario.nome : "Novo horário"}
      </h1>
      <EditorHorario inicial={horario ?? { ...NOVO, id: "" }} />
      {horario?.id && <PessoasDoHorario horarioId={horario.id} vinculos={vinculos} pessoas={pessoas} hoje={hojeSP()} />}
    </div>
  );
}
