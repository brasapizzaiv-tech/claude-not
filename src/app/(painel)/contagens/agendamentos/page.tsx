import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { NovoAgendamento } from "./form";
import { alternarAgendamento, excluirAgendamento } from "./actions";

const DIAS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

type Ag = {
  id: string;
  nome: string;
  frequencia: string;
  dia_semana: number | null;
  hora: number;
  minuto: number;
  modo: string;
  ativo: boolean;
  ultima_exec: string | null;
  divisao: { categoria_id: string; colaborador_id: string }[] | null;
};

function quando(a: Ag) {
  const hora = `${String(a.hora).padStart(2, "0")}:${String(a.minuto).padStart(2, "0")}`;
  if (a.frequencia === "diario") return `Todo dia às ${hora}`;
  const dia = a.dia_semana != null ? DIAS[a.dia_semana] : "";
  if (a.frequencia === "semanal") return `Toda ${dia} às ${hora}`;
  return `A cada 15 dias · ${dia} às ${hora}`;
}

export default async function AgendamentosPage() {
  const supabase = await createClient();
  const [{ data }, { data: cats }, { data: colabs }] = await Promise.all([
    supabase.from("contagem_agendamentos").select("*").order("criado_em"),
    supabase.from("categorias").select("id, nome").order("nome"),
    supabase.from("colaboradores").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  const ags = (data as Ag[]) ?? [];
  const categorias = (cats as { id: string; nome: string }[]) ?? [];
  const colaboradores = (colabs as { id: string; nome: string }[]) ?? [];

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Agendamentos de contagem
          </h1>
          <p className="mt-1 text-zinc-500">
            No dia e horário marcados, o sistema cria a contagem sozinho e ela
            aparece no app de cada colaborador.
          </p>
        </div>
        <Link
          href="/contagens"
          className="shrink-0 text-sm text-zinc-500 hover:text-orange-600"
        >
          ← Contagens
        </Link>
      </div>

      <NovoAgendamento categorias={categorias} colaboradores={colaboradores} />

      {ags.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum agendamento ainda. Crie o primeiro acima.
        </div>
      ) : (
        <div className="space-y-3">
          {ags.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {a.nome}
                  {!a.ativo && (
                    <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                      pausado
                    </span>
                  )}
                </p>
                <p className="text-sm text-zinc-500">{quando(a)}</p>
                <p className="text-xs text-zinc-400">
                  {a.modo === "personalizado"
                    ? `Personalizado · ${(a.divisao ?? []).length} seção(ões) · ${new Set((a.divisao ?? []).map((d) => d.colaborador_id)).size} pessoa(s)`
                    : a.modo === "todos"
                      ? "Divide entre todos (rodízio)"
                      : "Repete a última divisão"}
                  {a.ultima_exec ? ` · última: ${dataBR(a.ultima_exec)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <form action={alternarAgendamento} className="inline">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="ativo" value={(!a.ativo).toString()} />
                  <button
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      a.ativo
                        ? "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                  >
                    {a.ativo ? "Pausar" : "Ativar"}
                  </button>
                </form>
                <form action={excluirAgendamento} className="inline">
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-xs text-zinc-400 hover:text-red-600">
                    Excluir
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-zinc-400">
        Dica: a divisão “Repetir última” usa a divisão de categorias da contagem
        anterior (quem conta o quê). Faça uma contagem manual dividida uma vez, e
        os agendamentos repetem sozinhos.
      </p>
      <p className="mt-2 text-xs text-zinc-400">
        Precisa mandar o app pros colaboradores?{" "}
        <Link href="/colaboradores" className="text-orange-600 hover:underline">
          Colaboradores → Enviar app
        </Link>
        .
      </p>
    </div>
  );
}
