import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rodarBuscaSefaz, type ConfigSefaz } from "@/lib/sefaz/busca";

export const maxDuration = 60;

// Busca ESPERTA (roda a cada poucos minutos pelo Vercel Cron).
// Quando há notas manifestadas há pouco que ainda vieram só como resumo,
// força UMA busca para pegar o XML completo recém-liberado pela SEFAZ —
// respeitando um intervalo mínimo entre buscas forçadas, para nunca abusar
// (a SEFAZ pune com "656 Consumo Indevido" quem consulta demais).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("config_sefaz")
    .select("*")
    .limit(1)
    .maybeSingle();
  const cfg = data as ConfigSefaz | null;
  if (!cfg) return NextResponse.json({ erro: "sem configuração" });

  const agora = Date.now();

  // Notas manifestadas nos últimos 25 min (e há pelo menos 1 min, dando tempo
  // do XML aparecer) que ainda não têm itens — ou seja, aguardando o completo.
  const { data: candidatas } = await admin
    .from("notas_fiscais")
    .select("id")
    .not("manifestado_em", "is", null)
    .gte("manifestado_em", new Date(agora - 25 * 60 * 1000).toISOString())
    .lte("manifestado_em", new Date(agora - 60 * 1000).toISOString());

  let aguardando = 0;
  for (const n of candidatas ?? []) {
    const { count } = await admin
      .from("nota_itens")
      .select("id", { count: "exact", head: true })
      .eq("nota_id", n.id as string);
    if ((count ?? 0) === 0) aguardando++;
  }

  // Nada aguardando: não força nada (deixa o cron de hora em hora cuidar).
  if (aguardando === 0) {
    return NextResponse.json({ ok: true, aguardando: 0, forcado: false });
  }

  // Intervalo mínimo entre buscas forçadas (5 min) — evita bater demais.
  const forcadoEm = cfg.forcado_em ? new Date(cfg.forcado_em).getTime() : 0;
  if (agora - forcadoEm < 5 * 60 * 1000) {
    return NextResponse.json({
      ok: true,
      aguardando,
      forcado: false,
      motivo: "aguardando intervalo mínimo",
    });
  }

  const r = await rodarBuscaSefaz(admin, cfg, { forcar: true });
  return NextResponse.json({ ok: !r.erro, aguardando, forcado: true, ...r });
}
