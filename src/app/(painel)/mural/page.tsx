import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { dadosDoMural } from "@/lib/mural-server";
import { Mural } from "./mural";
import { LinkDaTv } from "./link-da-tv";

export const metadata = { title: "Mural do escritório · Brasa" };
export const dynamic = "force-dynamic";

// MURAL DO ESCRITÓRIO
//
// Irmã da TV da cozinha, mas para outro tipo de espera. A TV mostra o que
// precisa sair AGORA; aqui o assunto é o que precisa de uma RESPOSTA sua:
// alguém pediu folga e está esperando, alguém pediu uma compra e está
// esperando. Sem isso, os dois só apareciam quando o Rafael lembrava de abrir
// a tela certa.
//
// Três blocos, nesta ordem de propósito:
//   1. o que espera resposta  (é por isso que a tela existe)
//   2. as folgas que vêm aí   (planejar a escala)
//   3. os pedidos de compra   (o que já foi resolvido, pra dar o contexto)
//
// O mesmo desenho roda numa TV sem login em /tv/mural?chave=… — os dados saem
// daqui e de lá do mesmo lugar (src/lib/mural-server.ts).
export default async function MuralPage() {
  await exigirAcesso("/mural");
  const supabase = await createClient();

  const [{ folgas, solicitacoes, hoje }, { data: config }, h] = await Promise.all([
    dadosDoMural(supabase),
    supabase.from("mural_config").select("chave").maybeSingle(),
    headers(),
  ]);
  const origem = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;

  return (
    <div className="flex w-full flex-col">
      <Mural folgas={folgas} solicitacoes={solicitacoes} hoje={hoje} />
      <LinkDaTv chave={(config as { chave: string } | null)?.chave ?? null} origem={origem} />
    </div>
  );
}
