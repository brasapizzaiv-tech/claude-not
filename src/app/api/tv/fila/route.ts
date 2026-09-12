import { chaveTvOk, filaTv, recadosTv, temperaturaIvoti } from "@/lib/rodizio-server";

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
  const { configurada, ok } = chaveTvOk(url.searchParams.get("chave") ?? "");
  if (!configurada) return Response.json({ ok: false, erro: "RODIZIO_TV_CHAVE não configurada." }, { status: 503 });
  if (!ok) return Response.json({ ok: false, erro: "chave inválida" }, { status: 401 });

  try {
    const [pedidos, recados, temperatura] = await Promise.all([filaTv(), recadosTv(), temperaturaIvoti()]);
    return Response.json(
      { ok: true, agora: new Date().toISOString(), pedidos, recados, temperatura },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
