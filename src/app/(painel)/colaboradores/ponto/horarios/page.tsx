import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { Icone } from "@/components/icone";
import { hojeSP } from "@/lib/assiduidade-server";
import { duracao } from "@/lib/ponto-relatorio-core";
import { resumoHorario, totalSemana, type HorarioPonto } from "@/lib/ponto-horarios-core";

export const metadata = { title: "Horários · Ponto" };
export const dynamic = "force-dynamic";

// HORÁRIOS DE TRABALHO (migration 0255), como o "Config. de Horário" do RHiD:
// a lista com o resumo da semana e quantas pessoas estão em cada um hoje.
export default async function HorariosPage({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  await exigirAcesso("/colaboradores");
  const { todos } = await searchParams;
  const supabase = await createClient();
  const hoje = hojeSP();
  const [{ data: hs }, { data: vs }] = await Promise.all([
    supabase.from("ponto_horarios").select("id, nome, ativo, dias, tolerancia_extra, tolerancia_falta, limite_extra, limite_falta, noturno_inicio, noturno_fim").order("nome"),
    supabase.from("colaborador_horarios").select("horario_id, de, ate, colaboradores(nome, ativo)").lte("de", hoje),
  ]);
  const horarios = ((hs ?? []) as HorarioPonto[]).filter((h) => todos === "1" || h.ativo);
  type V = { horario_id: string; de: string; ate: string | null; colaboradores: { nome: string; ativo: boolean } | { nome: string; ativo: boolean }[] | null };
  const pessoasHoje = new Map<string, string[]>();
  for (const v of (vs ?? []) as V[]) {
    const c = Array.isArray(v.colaboradores) ? v.colaboradores[0] : v.colaboradores;
    if (!c?.ativo || (v.ate && String(v.ate).slice(0, 10) < hoje)) continue;
    pessoasHoje.set(v.horario_id, [...(pessoasHoje.get(v.horario_id) ?? []), c.nome.split(" ")[0]]);
  }

  return (
    <div className="w-full max-w-6xl px-4 py-5 md:px-[30px] md:py-[26px]">
      <p className="rotulo"><Link href="/colaboradores/ponto" className="hover:text-texto">Relatórios de ponto</Link></p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-numero text-[30px] font-bold leading-[1.05] tracking-apertada text-texto"><Icone nome="relogio" tamanho={22} /> Horários</h1>
          <p className="mt-1 max-w-2xl text-sm text-texto-suave">
            O horário de cada um decide o que é falta, atraso e extra no espelho. Cada pessoa fica num horário a partir de uma data; trocar não muda os meses que já passaram.
          </p>
        </div>
        <Link href="/colaboradores/ponto/horarios/novo" className="btn-principal">+ Novo horário</Link>
      </div>

      <div className="mt-4 flex gap-2 text-sm">
        <Link href="/colaboradores/ponto/horarios" aria-current={todos !== "1" ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${todos !== "1" ? "pilula-grafite" : "bg-painel-cartao text-texto shadow-[var(--sombra-controle)]"}`}>Ativos</Link>
        <Link href="/colaboradores/ponto/horarios?todos=1" aria-current={todos === "1" ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${todos === "1" ? "pilula-grafite" : "bg-painel-cartao text-texto shadow-[var(--sombra-controle)]"}`}>Todos</Link>
      </div>

      <div className="cartao mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="rotulo text-left">
            <tr><th className="px-4 py-3">Nome</th><th className="px-2 py-3">Horário</th><th className="px-2 py-3 text-right">Semana</th><th className="px-4 py-3">Quem está hoje</th></tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {horarios.map((h) => {
              const quem = pessoasHoje.get(h.id) ?? [];
              return (
                <tr key={h.id} className="hover:bg-superficie-suave">
                  <td className="px-4 py-3">
                    <Link href={`/colaboradores/ponto/horarios/${h.id}`} className="font-semibold text-texto hover:underline">{h.nome}</Link>
                    {!h.ativo && <span className="pilula pilula-neutra ml-2">inativo</span>}
                  </td>
                  <td className="px-2 py-3 text-texto-suave">{resumoHorario(h)}</td>
                  <td className="px-2 py-3 text-right font-numero font-semibold text-texto">{duracao(totalSemana(h))}</td>
                  <td className="px-4 py-3 text-texto-suave">{quem.length ? quem.join(", ") : <span className="text-texto-fraco">ninguém</span>}</td>
                </tr>
              );
            })}
            {horarios.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-texto-suave">Nenhum horário. Crie o primeiro em “Novo horário”.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
