import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AgendamentosClient, type Ag } from "./form";

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
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
            Agendamentos de contagem
          </h1>
          <p className="mt-1 text-texto-suave">
            No dia e horário marcados, o sistema cria a contagem sozinho e ela
            aparece no app de cada colaborador.
          </p>
        </div>
        <Link
          href="/contagens"
          className="shrink-0 text-sm text-texto-suave hover:text-orange-600"
        >
          ← Contagens
        </Link>
      </div>

      <AgendamentosClient
        ags={ags}
        categorias={categorias}
        colaboradores={colaboradores}
      />

      <p className="mt-6 text-xs text-texto-fraco">
        Dica: a divisão “Repetir última” usa a divisão de categorias da contagem
        anterior (quem conta o quê). Faça uma contagem manual dividida uma vez, e
        os agendamentos repetem sozinhos.
      </p>
      <p className="mt-2 text-xs text-texto-fraco">
        Precisa mandar o app pros colaboradores?{" "}
        <Link href="/colaboradores" className="text-orange-600 hover:underline">
          Colaboradores → Enviar app
        </Link>
        .
      </p>
    </div>
  );
}
