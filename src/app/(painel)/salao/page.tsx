import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { criarComandaBuffet } from "./actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function SalaoPage() {
  const supabase = await createClient();
  const [{ data: abertas }, { data: cfg }] = await Promise.all([
    supabase
      .from("pdv_comandas")
      .select("id, numero, peso, valor_buffet, livre, aberta_em")
      .eq("status", "aberta")
      .order("numero", { ascending: false }),
    supabase.from("pdv_config").select("valor").eq("chave", "preco_kg"),
  ]);
  const comandas =
    (abertas as {
      id: string;
      numero: number;
      peso: number | null;
      valor_buffet: number;
      livre: boolean;
    }[]) ?? [];
  const precoKg = Number((cfg ?? [])[0]?.valor ?? 0);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Salão / Buffet
          </h1>
          <p className="mt-1 text-zinc-500">
            Comandas abertas. Buffet: {precoKg > 0 ? `${moeda(precoKg)}/kg` : "preço não definido"}.
          </p>
        </div>
        <Link
          href="/salao/cardapio"
          className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
        >
          Cardápio / Config
        </Link>
      </div>

      {/* Nova comanda de buffet (peso manual por enquanto; depois vem da balança) */}
      <form
        action={criarComandaBuffet}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div>
          <label className="mb-1 block text-xs text-zinc-500">
            Peso do prato (kg)
          </label>
          <input
            name="peso"
            inputMode="decimal"
            placeholder="0,000"
            className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <button className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
          ⚖️ Gerar comanda
        </button>
        <span className="text-xs text-zinc-400">
          (amanhã o peso vem direto da balança)
        </span>
      </form>

      {comandas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhuma comanda aberta.
        </div>
      ) : (
        <div className="space-y-2">
          {comandas.map((c) => (
            <Link
              key={c.id}
              href={`/salao/comandas/${c.id}`}
              className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 hover:border-orange-300 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div>
                <p className="font-bold text-zinc-900 dark:text-zinc-100">
                  Comanda #{c.numero}
                </p>
                <p className="text-xs text-zinc-500">
                  {c.peso ? `${c.peso} kg` : "sem peso"}
                  {c.livre ? " · livre" : ""}
                </p>
              </div>
              <span className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
                {moeda(Number(c.valor_buffet))}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
