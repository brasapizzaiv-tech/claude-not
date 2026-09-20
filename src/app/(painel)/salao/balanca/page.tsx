import Link from "next/link";
import { Enviar } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { criarComandaBuffet } from "../actions";
import { BalancaLeitor } from "./leitor";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function BalancaPage() {
  const supabase = await createClient();
  const [{ data: cfgRows }, { data: agStatus }] = await Promise.all([
    supabase.from("pdv_config").select("chave, valor"),
    supabase.from("balanca_status").select("hostname, visto_em, fila_pendente").maybeSingle(),
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
      <Link href="/salao" className="text-sm text-texto-suave hover:text-orange-600">
        ← Salão
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-texto"><Icone nome="balanca" tamanho={20} /> Balança / Buffet</h1>
          <p className="mt-1 text-texto-suave">
            Buffet: {precoKg > 0 ? `${moeda(precoKg)}/kg` : "preço não definido no Cardápio"}.
          </p>
        </div>
        <Link
          href="/salao/balanca/quiosque"
          className="rounded-cartao bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:brightness-110"
        >
          <Icone nome="tela" tamanho={15} className="mr-1.5" /> Modo quiosque (autoatendimento)
        </Link>
      </div>

      {/* Agente da balança: status + ALERTA de fila offline (nunca em silêncio) */}
      {filaPendente > 0 && (
        <div className="mt-4 rounded-cartao border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <Icone nome="alerta" tamanho={15} className="mr-1.5" /> {filaPendente} pesagem(ns) na fila offline do agente — sincronizam sozinhas quando a internet do PC da balança voltar.
        </div>
      )}
      {ag?.visto_em && (
        <p className="mt-3 text-xs text-texto-fraco">
          Agente da balança:{" "}
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${agenteOnline ? "bg-emerald-500" : "bg-red-500"}`} />
            {agenteOnline ? "online" : "sem sinal"}
          </span>
          {ag.hostname ? ` · PC ${ag.hostname}` : ""} · visto {new Date(ag.visto_em).toLocaleString("pt-BR")}
        </p>
      )}

      <div className="mt-6">
        <BalancaLeitor taraPadrao={taraPadrao} />
      </div>

      <p className="mt-6 mb-2 text-xs font-medium text-texto-fraco">Ou digitar na mão</p>
      <form
        action={criarComandaBuffet}
        className="flex flex-wrap items-end gap-3 rounded-cartao border border-borda p-5"
      >
        <input type="hidden" name="mesa" value="Balança" />
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Peso do prato (kg)</label>
          <input
            name="peso"
            inputMode="decimal"
            autoFocus
            placeholder="0,000"
            className="w-36 rounded-controle border border-borda-forte bg-white px-3 py-2 text-lg text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Tara (kg)</label>
          <input
            name="tara"
            inputMode="decimal"
            defaultValue={taraPadrao ? String(taraPadrao).replace(".", ",") : ""}
            placeholder="0,000"
            className="w-28 rounded-controle border border-borda-forte bg-white px-3 py-2 text-lg text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950"
          />
        </div>
        <Enviar className="rounded-controle bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">
          Gerar comanda
        </Enviar>
      </form>

    </div>
  );
}
