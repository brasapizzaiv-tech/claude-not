import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import * as core from "@/lib/checklists-core";
import { ModelosClient } from "./modelos-client";

export const metadata = { title: "Modelos de checklist · Brasa" };
export const dynamic = "force-dynamic";

export default async function ModelosChecklistPage() {
  const supabase = await createClient();
  const db = supabase as unknown as core.Db;
  const [setores, modelos] = await Promise.all([
    core.listarSetores(db, true),
    core.listarModelos(db, true),
  ]);
  const itens = await core.listarItens(db, modelos.map((m) => m.id));

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link href="/checklists" className="text-sm text-zinc-500 hover:text-orange-600">← Checklists de hoje</Link>
      <div className="mt-2 mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50"><Icone nome="editar" tamanho={20} className="mr-2" /> Modelos de checklist</h1>
        <p className="mt-1 text-zinc-500">
          As listas que a equipe vê no app. Cada uma tem um setor e um momento (abertura, durante o turno, fechamento).
        </p>
      </div>
      <ModelosClient setores={setores} modelos={modelos} itens={itens} />
    </div>
  );
}
