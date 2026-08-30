import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { criarEntregador, alternarEntregador } from "../actions";

export const metadata = { title: "Entregadores · Delivery" };

export default async function EntregadoresPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("entregadores").select("id, nome, telefone, ativo").order("nome");
  const lista = (data ?? []) as { id: string; nome: string; telefone: string | null; ativo: boolean }[];

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Link href="/delivery" className="text-sm text-emerald-600">← Voltar pro painel</Link>
      <h1 className="mb-4 mt-2 text-xl font-bold">🛵 Entregadores</h1>

      <form action={criarEntregador} className="mb-6 flex flex-wrap gap-2">
        <input name="nome" required placeholder="Nome" className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
        <input name="telefone" placeholder="Telefone (opcional)" className="w-44 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
        <button className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white">Adicionar</button>
      </form>

      <div className="space-y-2">
        {lista.length === 0 && <p className="text-sm text-zinc-500">Nenhum entregador cadastrado.</p>}
        {lista.map((e) => (
          <div key={e.id} className={`flex items-center gap-3 rounded-xl border p-3 ${e.ativo ? "border-zinc-200 dark:border-zinc-800" : "border-zinc-200 opacity-50 dark:border-zinc-800"}`}>
            <div className="flex-1">
              <div className="font-medium">{e.nome}</div>
              {e.telefone && <div className="text-xs text-zinc-500">{e.telefone}</div>}
            </div>
            <form action={alternarEntregador}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="ativo" value={e.ativo ? "1" : "0"} />
              <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">{e.ativo ? "Desativar" : "Ativar"}</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
