import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { lerConfig } from "@/lib/assiduidade-server";
import type { TipoJustificativa } from "@/lib/ponto-dados";
import { RegrasInconsistencia, TiposJustificativa } from "./regras";

export const metadata = { title: "Justificativas e inconsistências · Ponto" };
export const dynamic = "force-dynamic";

// TIPOS DE JUSTIFICATIVA e TIPOS DE INCONSISTÊNCIA (migration 0258), como os
// cadastros do RHiD: o que cada justificativa faz no ponto e o que marca um
// dia como "tem problema".
export default async function RegrasPontoPage() {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const [cfg, { data: tipos }] = await Promise.all([
    lerConfig(supabase),
    supabase.from("justificativa_tipos").select("id, nome, efeito, tira_premio, ativo").order("nome"),
  ]);
  return (
    <div className="w-full max-w-6xl px-4 py-5 md:px-[30px] md:py-[26px]">
      <p className="rotulo"><Link href="/colaboradores/ponto" className="hover:text-texto">Relatórios de ponto</Link></p>
      <h1 className="mt-1 font-numero text-[30px] font-bold leading-[1.05] tracking-apertada text-texto">Justificativas e inconsistências</h1>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <TiposJustificativa tipos={(tipos ?? []) as TipoJustificativa[]} />
        <RegrasInconsistencia regras={cfg.inconsistencias} />
      </div>
    </div>
  );
}
