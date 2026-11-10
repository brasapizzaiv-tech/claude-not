import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rodarBuscaSefaz, podeForcar, type ConfigSefaz } from "@/lib/sefaz/busca";
import { marcarSinal } from "@/lib/saude";

export const maxDuration = 60;

// Busca ESPERTA (roda a cada poucos minutos pelo Vercel Cron).
// Quando há notas manifestadas há pouco que ainda vieram só como resumo,
// força UMA busca para pegar o XML completo recém-liberado pela SEFAZ —
// respeitando um intervalo mínimo entre buscas forçadas, para nunca abusar
// (a SEFAZ pune com "656 Consumo Indevido" quem consulta demais).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  // Aceita o segredo pelo cabeçalho (Vercel Cron) ou por ?key= (pinger externo).
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) {
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

  // Batimento: marca que o cron REALMENTE rodou (passou pela auth). Serve para
  // verificar se o Vercel Cron está disparando.
  await admin
    .from("config_sefaz")
    .update({ cron_completar_em: new Date().toISOString() })
    .eq("id", cfg.id);
  await marcarSinal("rotina:sefaz-completar", true, null);

  const agora = Date.now();

  // Notas manifestadas nas últimas 3 h (e há pelo menos 1 min, dando tempo do
  // XML aparecer) que ainda não têm itens — ou seja, aguardando o completo.
  // Janela larga porque, em lote, a SEFAZ às vezes leva bem mais de meia hora
  // para liberar o XML completo de todas as notas.
  const { data: candidatas } = await admin
    .from("notas_fiscais")
    .select("id, manifestado_em")
    .not("manifestado_em", "is", null)
    .gte("manifestado_em", new Date(agora - 3 * 60 * 60 * 1000).toISOString())
    .lte("manifestado_em", new Date(agora - 60 * 1000).toISOString());

  let aguardando = 0;
  let manifestMaisNova = 0; // a mais recente entre as que ainda esperam itens
  for (const n of candidatas ?? []) {
    const { count } = await admin
      .from("nota_itens")
      .select("id", { count: "exact", head: true })
      .eq("nota_id", n.id as string);
    if ((count ?? 0) === 0) {
      aguardando++;
      const t = new Date(n.manifestado_em as string).getTime();
      if (t > manifestMaisNova) manifestMaisNova = t;
    }
  }

  // AUTO-CURA: notas manifestadas entre 3h e 5 dias atrás que seguem SEM itens.
  // A busca anda só para frente (por NSU); um XML perdido/que falhou só volta
  // reprocessando desde o início. Faz isso sozinho, no máximo a cada 8h.
  const { data: presas } = await admin
    .from("notas_fiscais")
    .select("id")
    .not("manifestado_em", "is", null)
    .gte("manifestado_em", new Date(agora - 5 * 24 * 60 * 60 * 1000).toISOString())
    .lte("manifestado_em", new Date(agora - 3 * 60 * 60 * 1000).toISOString());
  let travadas = 0;
  for (const n of presas ?? []) {
    const { count } = await admin
      .from("nota_itens")
      .select("id", { count: "exact", head: true })
      .eq("nota_id", n.id as string);
    if ((count ?? 0) === 0) travadas++;
  }
  const reprocEm = cfg.reprocessado_em ? new Date(cfg.reprocessado_em).getTime() : 0;
  // (Nunca durante um castigo 656 nem logo depois de outra busca forçada.)
  if (travadas > 0 && agora - reprocEm > 8 * 60 * 60 * 1000 && podeForcar(cfg, false).ok) {
    await admin
      .from("config_sefaz")
      .update({ ult_nsu: "0", bloqueado_ate: null, reprocessado_em: new Date().toISOString() })
      .eq("id", cfg.id);
    const rr = await rodarBuscaSefaz(
      admin,
      { ...cfg, ult_nsu: "0", bloqueado_ate: null },
      { forcar: true },
    );
    return NextResponse.json({ ok: !rr.erro, reprocessado: true, travadas, ...rr });
  }

  // Nada aguardando: não força nada (deixa o cron de hora em hora cuidar).
  if (aguardando === 0) {
    return NextResponse.json({ ok: true, aguardando: 0, forcado: false, travadas });
  }

  // Só força enquanto a manifestação é recente (até 30 min), no máximo uma vez
  // a cada 10 min (podeForcar). Depois disso quem completa é a busca de hora em
  // hora: bater de 15 em 15 min por 3 horas arriscava o "656" (NFE-02).
  const recente = agora - manifestMaisNova < 30 * 60 * 1000;
  if (!recente) {
    return NextResponse.json({ ok: true, aguardando, forcado: false, motivo: "fica pra busca de hora em hora" });
  }
  if (!podeForcar(cfg, false).ok) {
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
