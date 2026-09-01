import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { criarComandaBuffet } from "../actions";
import { BalancaLeitor } from "./leitor";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function BalancaPage() {
  const supabase = await createClient();
  const [{ data: cfgRows }, { data: agStatus }] = await Promise.all([
    supabase.from("pdv_config").select("chave, valor"),
    supabase.from("balanca_status").select("hostname, visto_em, fila_pendente").eq("id", 1).maybeSingle(),
  ]);
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;
  const precoKg = Number(cfg.preco_kg ?? 0);
  const taraPadrao = Number(cfg.tara_padrao ?? 0);

  const ag = agStatus as { hostname: string | null; visto_em: string | null; fila_pendente: number } | null;
  const agenteOnline = !!ag?.visto_em && new Date().getTime() - new Date(ag.visto_em).getTime() < 60000;
  const filaPendente = Number(ag?.fila_pendente ?? 0);

  return (
    <div className="mx-auto max-w-lg p-6">
      <Link href="/salao" className="text-sm text-zinc-500 hover:text-orange-600">
        ← Salão
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">⚖️ Balança / Buffet</h1>
          <p className="mt-1 text-zinc-500">
            Buffet: {precoKg > 0 ? `${moeda(precoKg)}/kg` : "preço não definido no Cardápio"}.
          </p>
        </div>
        <Link
          href="/salao/balanca/quiosque"
          className="rounded-xl bg-[#C78340] px-5 py-3 text-sm font-bold text-white hover:brightness-110"
        >
          🖥️ Modo quiosque (autoatendimento)
        </Link>
      </div>

      {/* Agente da balança: status + ALERTA de fila offline (nunca em silêncio) */}
      {filaPendente > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          ⚠️ {filaPendente} pesagem(ns) na fila offline do agente — sincronizam sozinhas quando a internet do PC da balança voltar.
        </div>
      )}
      {ag?.visto_em && (
        <p className="mt-3 text-xs text-zinc-400">
          Agente da balança: {agenteOnline ? "🟢 online" : "🔴 sem sinal"}
          {ag.hostname ? ` · PC ${ag.hostname}` : ""} · visto {new Date(ag.visto_em).toLocaleString("pt-BR")}
        </p>
      )}

      <div className="mt-6">
        <BalancaLeitor taraPadrao={taraPadrao} />
      </div>

      <p className="mt-6 mb-2 text-xs font-medium uppercase text-zinc-400">Ou digitar na mão</p>
      <form
        action={criarComandaBuffet}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800"
      >
        <input type="hidden" name="mesa" value="Balança" />
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Peso do prato (kg)</label>
          <input
            name="peso"
            inputMode="decimal"
            autoFocus
            placeholder="0,000"
            className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-lg text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Tara (kg)</label>
          <input
            name="tara"
            inputMode="decimal"
            defaultValue={taraPadrao ? String(taraPadrao).replace(".", ",") : ""}
            placeholder="0,000"
            className="w-28 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-lg text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <button className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">
          Gerar comanda
        </button>
      </form>

    </div>
  );
}
