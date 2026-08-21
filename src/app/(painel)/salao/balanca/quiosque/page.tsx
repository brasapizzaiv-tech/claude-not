import { createClient } from "@/lib/supabase/server";
import { QuiosqueBalanca } from "./quiosque";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default async function QuiosquePage() {
  const supabase = await createClient();
  const { data: cfgRows } = await supabase.from("pdv_config").select("chave, valor");
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;

  const dow = new Date(new Date().getTime() - 3 * 3600 * 1000).getUTCDay();
  const kgDia = (d: number) => Number(cfg[`preco_kg_${d}`] || cfg.preco_kg || 0);
  const livreDia = (d: number) => Number(cfg[`buffet_livre_${d}`] || cfg.buffet_livre || 0);

  const legenda = DIAS.map((nome, d) => ({
    nome,
    kg: kgDia(d),
    livre: livreDia(d),
    hoje: d === dow,
  }));

  return (
    <QuiosqueBalanca
      precoKg={kgDia(dow)}
      buffetLivre={livreDia(dow)}
      taraPadrao={Number(cfg.tara_padrao ?? 0)}
      legenda={legenda}
    />
  );
}
