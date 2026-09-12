import { createAdminClient } from "@/lib/supabase/admin";
import { PRONTO_SOME_SEG } from "@/lib/rodizio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fila do rodízio pra TV da cozinha.
//
// A TV não tem teclado nem login: a proteção é a chave fixa na URL
// (?chave=...), conferida aqui contra a variável de ambiente RODIZIO_TV_CHAVE.
// A leitura passa pelo cliente administrativo no servidor — nada da tabela
// fica exposto pra quem não tem a chave, e só esta tabela é entregue.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const chave = url.searchParams.get("chave") ?? "";
  const esperada = (process.env.RODIZIO_TV_CHAVE ?? "").trim();
  if (!esperada) return Response.json({ ok: false, erro: "RODIZIO_TV_CHAVE não configurada." }, { status: 503 });
  if (!chave || chave !== esperada) return Response.json({ ok: false, erro: "chave inválida" }, { status: 401 });

  const admin = createAdminClient();
  // Pendentes e no forno (de qualquer hora) + prontos recentes (a TV mostra por 90 s).
  const desde = new Date(Date.now() - (PRONTO_SOME_SEG + 30) * 1000).toISOString();
  const { data, error } = await admin
    .from("pedidos_rodizio")
    .select("id, mesa, sabor, tipo, fracao, quantidade, observacao, status, criado_em, forno_em, pronto_em, garcom")
    .or(`status.in.(pendente,forno),and(status.eq.pronto,pronto_em.gte.${desde})`)
    .order("criado_em", { ascending: true })
    .limit(200);
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });

  return Response.json(
    { ok: true, agora: new Date().toISOString(), pedidos: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
