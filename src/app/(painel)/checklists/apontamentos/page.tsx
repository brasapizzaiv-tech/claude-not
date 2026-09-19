import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import * as core from "@/lib/checklists-core";
import { ApontamentosClient } from "./apontamentos-client";

export const metadata = { title: "Apontamentos · Brasa" };
export const dynamic = "force-dynamic";

// Todos os apontamentos: os que estão na TV, os resolvidos e os que expiraram
// (pra ver o que se repete).
export default async function ApontamentosPage() {
  const supabase = await createClient();
  const hoje = core.hojeSP();
  const { data } = await supabase
    .from("checklist_apontamentos")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(300);
  const todos = (data as core.Apontamento[]) ?? [];

  // Quantas vezes o mesmo item já foi apontado (o que se repete).
  const repete = new Map<string, { texto: string; setor: string | null; n: number }>();
  for (const a of todos) {
    const chave = (a.item_texto ?? a.texto).toLowerCase().slice(0, 60);
    const r = repete.get(chave) ?? { texto: a.item_texto ?? a.texto, setor: a.setor_nome, n: 0 };
    r.n++;
    repete.set(chave, r);
  }
  const maisRepetidos = [...repete.values()].filter((r) => r.n > 1).sort((a, b) => b.n - a.n).slice(0, 8);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link href="/checklists/revisao" className="text-sm text-zinc-500 hover:text-orange-600">← Revisar checklists</Link>
      <div className="mt-2 mb-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50"><Icone nome="fixar" tamanho={20} className="mr-2" /> Apontamentos</h1>
        <p className="mt-1 text-zinc-500">O que está na TV, o que já foi resolvido e o que ficou pelo caminho.</p>
      </div>
      <ApontamentosClient apontamentos={todos} hoje={hoje} maisRepetidos={maisRepetidos} />
    </div>
  );
}
