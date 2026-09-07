import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PerfisClient, type Perfil, type Categoria, type ItemCard } from "./perfis-client";

export const metadata = { title: "Perfis fiscais" };

export default async function PerfisFiscaisPage() {
  const supabase = await createClient();
  const [{ data: perfis }, { data: cats }, { data: itens }, { data: cfg }] = await Promise.all([
    supabase.from("perfis_fiscais").select("id, nome, ncm, cest, cfop, csosn, origem, unidade, pis_cst, cofins_cst, homologado, obs, ativo").order("nome"),
    supabase.from("pdv_categorias").select("id, nome, perfil_fiscal_id").order("ordem"),
    supabase.from("pdv_itens").select("id, nome, categoria, perfil_fiscal_id").eq("ativo", true).order("nome"),
    supabase.from("config_fiscal").select("chave, valor").in("chave", ["ncm_buffet", "cfop_padrao", "csosn_padrao"]),
  ]);
  const c: Record<string, string> = {};
  for (const r of cfg ?? []) c[r.chave] = r.valor ?? "";

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link href="/fiscal" className="text-sm text-zinc-500 hover:text-orange-600">← Config fiscal</Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">🧾 Perfis fiscais</h1>
      <p className="mb-6 mt-1 text-sm text-zinc-500">
        Em vez de preencher NCM/CFOP/CSOSN produto por produto: crie um perfil e aplique na categoria inteira do cardápio. A NFC-e usa o perfil de cada item.
      </p>
      <PerfisClient
        perfis={(perfis as Perfil[]) ?? []}
        categorias={(cats as Categoria[]) ?? []}
        itens={(itens as ItemCard[]) ?? []}
        padrao={{ ncm: c.ncm_buffet || "21069090", cfop: c.cfop_padrao || "5102", csosn: c.csosn_padrao || "102" }}
      />
    </div>
  );
}
