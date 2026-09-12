import Link from "next/link";
import { listarRecadosTv } from "./actions";
import { RecadosClient } from "./recados-client";

export const metadata = { title: "Recados da TV · Brasa" };
export const dynamic = "force-dynamic";

// Recados que aparecem na TV da cozinha quando não há pedido do rodízio
// (a TV vira relógio + painel de recados).
export default async function RecadosTvPage() {
  const recados = await listarRecadosTv();
  return (
    <div className="p-4 md:p-6">
      <Link href="/cozinha" className="text-sm text-zinc-500 hover:text-orange-600">← Tablet da cozinha</Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">📺 Recados da TV</h1>
      <p className="mb-4 mt-1 text-sm text-zinc-500">
        Quando não tem pedido do rodízio, a TV da cozinha mostra o relógio, a data e estes recados (até 5 ativos). Um recado com data “até” some sozinho depois dela.
      </p>
      <RecadosClient inicial={recados} />
    </div>
  );
}
