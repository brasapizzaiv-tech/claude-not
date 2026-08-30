import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { temChaveMapa } from "@/lib/geo";
import { salvarConfigDelivery } from "../actions";

export const metadata = { title: "Config · Delivery" };

export default async function DeliveryConfigPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("delivery_config")
    .select("origem_endereco, origem_lat, origem_lng, taxa_base, preco_km, raio_max_km, tempo_preparo_min, aberto")
    .eq("id", 1)
    .maybeSingle();
  const c = (data ?? {}) as {
    origem_endereco?: string; origem_lat?: number; origem_lng?: number;
    taxa_base?: number; preco_km?: number; raio_max_km?: number; tempo_preparo_min?: number; aberto?: boolean;
  };
  const temChave = temChaveMapa();
  const geocodificado = c.origem_lat != null && c.origem_lng != null;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Link href="/delivery" className="text-sm text-emerald-600">← Voltar pro painel</Link>
      <h1 className="mb-1 mt-2 text-xl font-bold">⚙️ Config do delivery</h1>
      <p className="mb-4 text-sm text-zinc-500">Taxa de entrega calculada pela distância até o restaurante.</p>

      <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${temChave ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
        {temChave
          ? "✓ Chave do Google Maps configurada — distância precisa (por rota)."
          : "ⓘ Sem chave do Google Maps: usando um cálculo grátis aproximado (linha reta). Pra ficar preciso, adicione GOOGLE_MAPS_API_KEY no .env do servidor."}
      </div>

      <form action={salvarConfigDelivery} className="space-y-4">
        <div>
          <label className="text-sm font-semibold">Endereço do restaurante</label>
          <input name="origem_endereco" defaultValue={c.origem_endereco ?? ""} placeholder="Rua, número, bairro, Ivoti - RS" className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
          <p className="mt-1 text-xs text-zinc-500">
            {geocodificado ? `📍 Localizado no mapa (${Number(c.origem_lat).toFixed(4)}, ${Number(c.origem_lng).toFixed(4)}).` : "Ao salvar, o sistema localiza o endereço no mapa (ponto de partida das entregas)."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold">Taxa base (R$)</label>
            <input name="taxa_base" defaultValue={c.taxa_base ?? 0} inputMode="decimal" className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
            <p className="mt-1 text-xs text-zinc-500">Valor fixo somado a toda entrega.</p>
          </div>
          <div>
            <label className="text-sm font-semibold">Valor por km (R$)</label>
            <input name="preco_km" defaultValue={c.preco_km ?? 0} inputMode="decimal" className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
            <p className="mt-1 text-xs text-zinc-500">Multiplicado pela distância.</p>
          </div>
          <div>
            <label className="text-sm font-semibold">Raio máximo (km)</label>
            <input name="raio_max_km" defaultValue={c.raio_max_km ?? 0} inputMode="decimal" className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
            <p className="mt-1 text-xs text-zinc-500">0 = sem limite. Avisa se o endereço passar disso.</p>
          </div>
          <div>
            <label className="text-sm font-semibold">Tempo de preparo (min)</label>
            <input name="tempo_preparo_min" defaultValue={c.tempo_preparo_min ?? 40} inputMode="numeric" className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
            <p className="mt-1 text-xs text-zinc-500">Usado pra calcular a previsão de entrega.</p>
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" name="aberto" defaultChecked={c.aberto ?? true} className="h-4 w-4" />
          <span className="text-sm font-semibold">Delivery aberto (aceitando pedidos)</span>
        </label>

        <div className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
          <b>Exemplo:</b> taxa base R$ 4,00 + R$ 1,50/km. Um endereço a 2 km fica <b>R$ 7,00</b>.
        </div>

        <button className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white">Salvar</button>
      </form>
    </div>
  );
}
