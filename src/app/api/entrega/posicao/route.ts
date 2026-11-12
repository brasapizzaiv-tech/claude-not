import { registrarPosicao } from "@/app/entrega/[token]/entrega-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MSG-04: posição do GPS do entregador por uma rota FIXA. Antes ia por ação do
// servidor: depois de cada publicação o app aberto no bolso chamava a ação
// velha, o servidor não reconhecia e o erro era engolido — o mapa do painel
// parava até o entregador mexer no app. Uma rota não muda de nome entre versões.
export async function POST(req: Request) {
  let b: { token?: unknown; lat?: unknown; lng?: unknown; precisao?: unknown };
  try { b = await req.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const token = typeof b.token === "string" ? b.token : "";
  if (!/^[0-9a-f]{16,64}$/i.test(token)) return Response.json({ ok: false }, { status: 400 });
  const precisao = b.precisao == null ? null : Number(b.precisao);
  const r = await registrarPosicao(token, Number(b.lat), Number(b.lng), precisao);
  return Response.json(r, { status: r.ok ? 200 : 403 });
}
