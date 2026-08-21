import { createClient } from "@/lib/supabase/server";
import { QuiosqueBalanca } from "./quiosque";

export default async function QuiosquePage() {
  const supabase = await createClient();
  const { data: cfgRows } = await supabase.from("pdv_config").select("chave, valor");
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;

  return (
    <QuiosqueBalanca
      precoKg={Number(cfg.preco_kg ?? 0)}
      buffetLivre={Number(cfg.buffet_livre ?? 0)}
      taraPadrao={Number(cfg.tara_padrao ?? 0)}
    />
  );
}
