import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "AQUI RODA UM SISTEMA NOSSO, COM APP DA EQUIPE?" — o app Motelli Equipe
// pergunta antes de abrir um endereço (link colado, QR lido ou devolvido pelo
// código). Mesma ideia do /api/entrega/identidade: sem isso um link qualquer
// abriria um site estranho dentro do app, com a câmera liberada. A resposta
// não leva nada sigiloso, só o nome e a cor da empresa.
export async function GET() {
  let nome: string | null = null;
  let cor: string | null = null;
  try {
    const { data } = await createAdminClient().from("empresas").select("nome, cor_primaria").eq("ativo", true).limit(1).maybeSingle();
    const e = data as { nome: string | null; cor_primaria: string | null } | null;
    nome = e?.nome ?? null;
    cor = /^#[0-9a-f]{6}$/i.test(String(e?.cor_primaria ?? "")) ? String(e?.cor_primaria) : null;
  } catch {
    // Banco fora do ar não impede a entrada: o que importa é o "sistema".
  }
  return Response.json(
    { sistema: "equipe", versao: 1, nome, cor },
    { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } },
  );
}
