import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { listarModelosCompletos } from "@/lib/whatsapp";
import { NovaCampanha } from "./nova-client";

export const metadata = { title: "Nova campanha · Delivery" };
export const dynamic = "force-dynamic";

export default async function NovaCampanhaPage() {
  const supabase = await createClient();
  const [mods, { data: cupRows }, { data: cfg }] = await Promise.all([
    listarModelosCompletos(),
    supabase.from("cupons").select("codigo").eq("ativo", true).order("codigo"),
    supabase.from("wpp_config").select("limite_dia, preco_marketing, preco_utilidade").maybeSingle(),
  ]);
  const c = cfg as { limite_dia: number; preco_marketing: number | null; preco_utilidade: number | null } | null;
  return (
    <div className="w-full max-w-3xl p-4">
      <Link href="/delivery/campanhas" className="text-sm text-emerald-600">← Voltar pras campanhas</Link>
      <h1 className="mb-4 mt-2 flex items-center gap-2 text-xl font-bold"><Icone nome="megafone" tamanho={19} /> Nova campanha</h1>
      {!mods.ok && <p className="mb-3 rounded-controle bg-red-500/10 px-3 py-2 text-sm text-red-600">Não consegui ler os modelos na Meta: {mods.erro}</p>}
      <NovaCampanha
        modelos={mods.ok ? mods.modelos : []}
        cupons={((cupRows as { codigo: string }[]) ?? []).map((x) => x.codigo)}
        limiteDia={c?.limite_dia ?? 250}
        precoMarketing={c?.preco_marketing != null ? Number(c.preco_marketing) : null}
        precoUtilidade={c?.preco_utilidade != null ? Number(c.preco_utilidade) : null}
      />
    </div>
  );
}
