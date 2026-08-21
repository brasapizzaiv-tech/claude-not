import { createClient } from "@/lib/supabase/server";
import { QuiosqueBalanca } from "./quiosque";

export default async function QuiosquePage() {
  const supabase = await createClient();
  const { data: cfgRows } = await supabase.from("pdv_config").select("chave, valor");
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;

  // Preço de HOJE (por dia da semana). Fuso de Brasília.
  const dow = new Date(new Date().getTime() - 3 * 3600 * 1000).getUTCDay();
  const kgDia = Number(cfg[`preco_kg_${dow}`] || cfg.preco_kg || 0);
  const livreDia = Number(cfg[`buffet_livre_${dow}`] || cfg.buffet_livre || 0);

  return (
    <QuiosqueBalanca
      precoKg={kgDia}
      buffetLivre={livreDia}
      taraPadrao={Number(cfg.tara_padrao ?? 0)}
    />
  );
}
