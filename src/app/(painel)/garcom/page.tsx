import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function GarcomPage() {
  const supabase = await createClient();
  const [{ data: abertas }, { data: cfgRows }] = await Promise.all([
    supabase.from("pdv_comandas").select("id, numero, mesa").eq("status", "aberta").order("numero"),
    supabase.from("pdv_config").select("chave, valor"),
  ]);
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;
  const qtdMesas = Number(cfg.qtd_mesas || 40);

  const porMesa = new Map<string, number[]>();
  for (const c of (abertas as { numero: number; mesa: string | null }[]) ?? []) {
    const nome = c.mesa || "Balcão";
    porMesa.set(nome, [...(porMesa.get(nome) ?? []), c.numero]);
  }

  const nomes = ["Balcão", ...Array.from({ length: qtdMesas }, (_, i) => `Mesa ${i + 1}`), "Balança"];
  for (const nome of porMesa.keys()) if (!nomes.includes(nome)) nomes.push(nome);

  return (
    <div className="min-h-screen bg-zinc-950 p-2 text-zinc-100">
      <h1 className="px-1 py-2 text-xl font-bold">🧑‍🍳 Mesas</h1>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {nomes.map((nome) => {
          const comandas = porMesa.get(nome) ?? [];
          const ocupada = comandas.length > 0;
          return (
            <Link
              key={nome}
              href={`/garcom/mesa/${encodeURIComponent(nome)}`}
              className="flex min-h-[84px] flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-2"
            >
              <span className={`rounded px-2 py-1 text-center text-sm font-bold ${ocupada ? "bg-red-400/90 text-red-950" : "bg-emerald-400/90 text-emerald-950"}`}>
                {nome}
              </span>
              {ocupada && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {comandas.map((n) => (
                    <span key={n} className="rounded bg-zinc-700 px-1.5 text-[11px] text-zinc-200">{n}</span>
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
