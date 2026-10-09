import { aniversariantesMes, apontamentosTv, cardapioTv, chaveTvOk, eventosTv, feriadosTv, filaTv, recadosTv, temperaturaIvoti, ultimaAtividadeRodizio } from "@/lib/rodizio-server";
import { empresaAtualId } from "@/lib/empresa";
import { cameraNoAr, destinoCamera } from "@/lib/tv-camera";

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
    // Modo leve: só a fila (o que muda de minuto em minuto). A TV usa quando o
    // banco avisa que um pedido mudou e na consulta de segurança de 30 s; o
    // resto (cardápio, recados, feriados...) vem na consulta completa, a cada
    // 5 min. Antes vinha tudo a cada 3 s — 22 GB por mês só de cardápio.
    if (url.searchParams.get("modo") === "leve") {
      const [pedidos, ultimaAtividade, cam] = await Promise.all([filaTv(), ultimaAtividadeRodizio(), cameraNoAr()]);
      const camera = cam ? destinoCamera(cam, url.searchParams.get("chave") ?? "", "") : null;
      return Response.json(
        { ok: true, leve: true, agora: new Date().toISOString(), pedidos, ultimaAtividade, camera },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const [pedidos, recados, temperatura, aniversariantes, cardapio, ultimaAtividade, apontamentos, feriados, empresaId] = await Promise.all([
      filaTv(), recadosTv(), temperaturaIvoti(), aniversariantesMes(), cardapioTv(), ultimaAtividadeRodizio(), apontamentosTv(), feriadosTv(), empresaAtualId(),
    ]);
    const eventos = await eventosTv();
    // Canal do Realtime em que o banco avisa "mudou" (migration 0207).
    const canal = `tv-rodizio:${empresaId ?? "sem-empresa"}`;
    return Response.json(
      { ok: true, agora: new Date().toISOString(), pedidos, recados, temperatura, aniversariantes, cardapio, ultimaAtividade, apontamentos, feriados, eventos, canal },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
