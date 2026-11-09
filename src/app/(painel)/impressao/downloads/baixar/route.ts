import { NextResponse, type NextRequest } from "next/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Só os instaladores conhecidos (nunca um caminho qualquer do bucket).
const PERMITIDOS = new Set(["AgenteImpressao-Setup.exe", "AgenteBalanca-Setup.exe", "AgenteTEF-Setup.exe"]);

// Confere o acesso e manda pro link assinado do instalador (vale 10 minutos).
export async function GET(req: NextRequest) {
  await exigirAcesso("/impressao");
  const arquivo = req.nextUrl.searchParams.get("arquivo") ?? "";
  if (!PERMITIDOS.has(arquivo)) return NextResponse.json({ erro: "arquivo desconhecido" }, { status: 400 });
  const { data, error } = await createAdminClient().storage.from("instaladores").createSignedUrl(arquivo, 600, { download: arquivo });
  if (error || !data?.signedUrl) return NextResponse.json({ erro: "instalador não encontrado" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
