import { createAdminClient } from "@/lib/supabase/admin";
import { empresaAtualId } from "@/lib/empresa";
import { chaveTvOk } from "@/lib/rodizio-server";
import { urlCameraOk } from "@/lib/tv-camera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aviso do computador da câmera do buffet (projeto app-buffet, ponte-tv.ps1):
// POST /api/tv/camera?chave=...  { "url": "http://192.168.0.10:8080/", "aoVivo": true }
// Mesma chave da TV da cozinha. Não muda o interruptor "ativo".
export async function POST(req: Request) {
  const { configurada, ok } = chaveTvOk(new URL(req.url).searchParams.get("chave") ?? "");
  if (!configurada) return Response.json({ ok: false, erro: "RODIZIO_TV_CHAVE não configurada." }, { status: 503 });
  if (!ok) return Response.json({ ok: false, erro: "chave inválida" }, { status: 401 });

  const corpo = (await req.json().catch(() => null)) as { url?: unknown; aoVivo?: unknown } | null;
  const url = urlCameraOk(String(corpo?.url ?? ""));
  if (!url) return Response.json({ ok: false, erro: "url precisa ser da rede interna, ex.: http://192.168.0.10:8080/" }, { status: 400 });

  const empresaId = await empresaAtualId();
  const admin = createAdminClient();
  const { error } = await admin.from("tv_camera").upsert(
    { ...(empresaId ? { empresa_id: empresaId } : {}), url, ao_vivo: corpo?.aoVivo === true, visto_em: new Date().toISOString() },
    { onConflict: "empresa_id" },
  );
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
