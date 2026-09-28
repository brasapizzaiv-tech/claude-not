import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Qual versão do sistema está no ar. A tela aberta pergunta de tempos em
// tempos: quando muda, foi publicada uma versão nova enquanto a página estava
// aberta — e daí em diante os cliques dela falham (o servidor não reconhece
// mais as ações da versão antiga). Ver components/vigia-versao.tsx.
export function GET() {
  const versao =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.NEXT_DEPLOYMENT_ID ||
    "dev";
  return NextResponse.json({ versao }, { headers: { "Cache-Control": "no-store, must-revalidate" } });
}
