import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "AQUI RODA UM SISTEMA DE ENTREGAS?"
//
// É o que o app do entregador pergunta antes de abrir um endereço colado. O app
// publicado na loja serve qualquer restaurante, então ele aceita o domínio que
// o entregador colar — e sem esta conferência um link qualquer abriria um site
// estranho DENTRO do app, onde o GPS em segundo plano e a câmera já estão
// liberados.
//
// Não é cadeado criptográfico: é a porta que exige que o outro lado seja, de
// fato, um sistema nosso. Por isso a resposta não leva NADA de sigiloso — só o
// nome e a cor com que o app se apresenta, que já estão públicos no site.
export async function GET() {
  let nome: string | null = null;
  let cor: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("empresas")
      .select("nome, cor_primaria")
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    const e = data as { nome: string | null; cor_primaria: string | null } | null;
    nome = e?.nome ?? null;
    // Só aceita o que for mesmo uma cor: isto vai parar num `style` do app.
    cor = /^#[0-9a-f]{6}$/i.test(String(e?.cor_primaria ?? "")) ? String(e?.cor_primaria) : null;
  } catch {
    // Banco fora do ar não pode impedir o entregador de entrar: o que importa
    // nesta resposta é o "sistema: entregas", e isso não depende do banco.
  }

  return Response.json(
    { sistema: "entregas", versao: 1, nome, cor },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        // O app abre de um endereço local (a tela de dentro dele), então a
        // resposta precisa atravessar origens.
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
