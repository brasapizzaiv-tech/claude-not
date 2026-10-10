import { empresaDoAgente } from "@/lib/impressao-agente";
import { receberAfd, ultimoNsr } from "@/lib/ponto-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Batidas do relógio de ponto, mandadas pelo agente do PC central (o mesmo da
// impressão, com o mesmo token — o token diz de qual restaurante é o PC).
//
// GET  ?equipamento=<serial>  → { ultimoNsr }  (de onde o agente continua)
// POST { equipamento, afd: "<texto do AFD>", usuarios: [{ cpf, nome }] }
const SERIAL = /^[A-Za-z0-9/._-]{3,40}$/;

export async function GET(req: Request) {
  const empresaId = await empresaDoAgente(req);
  if (!empresaId) return Response.json({ erro: "não autorizado" }, { status: 401 });
  const equipamento = new URL(req.url).searchParams.get("equipamento") ?? "";
  if (!SERIAL.test(equipamento)) return Response.json({ erro: "equipamento inválido" }, { status: 400 });
  return Response.json({ ultimoNsr: await ultimoNsr(empresaId, equipamento) });
}

export async function POST(req: Request) {
  const empresaId = await empresaDoAgente(req);
  if (!empresaId) return Response.json({ erro: "não autorizado" }, { status: 401 });
  const corpo = (await req.json().catch(() => null)) as { equipamento?: unknown; afd?: unknown; usuarios?: unknown } | null;
  const equipamento = String(corpo?.equipamento ?? "");
  const afd = typeof corpo?.afd === "string" ? corpo.afd : "";
  if (!SERIAL.test(equipamento)) return Response.json({ erro: "equipamento inválido" }, { status: 400 });
  if (afd.length > 5_000_000) return Response.json({ erro: "AFD grande demais" }, { status: 413 });
  const usuarios = Array.isArray(corpo?.usuarios)
    ? (corpo.usuarios as { cpf?: unknown; nome?: unknown }[]).slice(0, 2000).map((u) => ({ cpf: String(u.cpf ?? ""), nome: String(u.nome ?? "").slice(0, 120) }))
    : [];
  try {
    const r = await receberAfd(empresaId, equipamento, afd, usuarios);
    return Response.json({ ok: true, ...r, ultimoNsr: await ultimoNsr(empresaId, equipamento) });
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
