import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminDaEmpresa } from "@/lib/supabase/admin-empresa";
import { rodarBuscaSefaz, podeForcar, type ConfigSefaz } from "@/lib/sefaz/busca";
import { marcarSinal } from "@/lib/saude";
import { cronAutorizado } from "@/lib/cron-auth";

export const maxDuration = 60;

// Busca ESPERTA (roda a cada poucos minutos pelo Vercel Cron).
// Quando há notas manifestadas há pouco que ainda vieram só como resumo,
// força UMA busca para pegar o XML completo recém-liberado pela SEFAZ —
// respeitando um intervalo mínimo entre buscas forçadas, para nunca abusar
// (a SEFAZ pune com "656 Consumo Indevido" quem consulta demais).
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  // Uma configuração por empresa (cada uma com o certificado dela). Antes era
  // `limit(1)`: com dois restaurantes no banco, só o primeiro era olhado.
  const base = createAdminClient();
  const { data } = await base.from("config_sefaz").select("*").not("cert_pfx", "is", null).order("empresa_id");
  const cfgs = (data as ConfigSefaz[] | null) ?? [];
  if (!cfgs.length) return NextResponse.json({ erro: "sem configuração" });

  const resultados: Record<string, unknown>[] = [];
  for (const cfg of cfgs) {
    // As notas olhadas e as que chegam ficam presas à empresa do certificado.
    const admin = cfg.empresa_id ? adminDaEmpresa(cfg.empresa_id, base) : base;
    resultados.push({ empresa: cfg.empresa_id, ...(await completarEmpresa(admin, cfg)) });
  }
  if (resultados.length === 1) return NextResponse.json(resultados[0]);
  return NextResponse.json({ ok: resultados.every((r) => r.ok), resultados });
}

async function completarEmpresa(admin: ReturnType<typeof createAdminClient>, cfg: ConfigSefaz): Promise<Record<string, unknown>> {
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
    // Itens contados junto (DES-005): antes era uma consulta por nota.
    .select("id, manifestado_em, nota_itens(count)")
    .not("manifestado_em", "is", null)
    .gte("manifestado_em", new Date(agora - 3 * 60 * 60 * 1000).toISOString())
    .lte("manifestado_em", new Date(agora - 60 * 1000).toISOString());
  const itensDe = (n: { nota_itens?: { count: number }[] | null }) => Number(n.nota_itens?.[0]?.count ?? 0);

  let aguardando = 0;
  let manifestMaisNova = 0; // a mais recente entre as que ainda esperam itens
  for (const n of candidatas ?? []) {
    if (itensDe(n as { nota_itens?: { count: number }[] | null }) === 0) {
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
    .select("id, nota_itens(count)")
    .not("manifestado_em", "is", null)
    .gte("manifestado_em", new Date(agora - 5 * 24 * 60 * 60 * 1000).toISOString())
    .lte("manifestado_em", new Date(agora - 3 * 60 * 60 * 1000).toISOString());
  let travadas = 0;
  for (const n of presas ?? []) if (itensDe(n as { nota_itens?: { count: number }[] | null }) === 0) travadas++;
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
    return { ok: !rr.erro, reprocessado: true, travadas, ...rr };
  }

  // Nada aguardando: não força nada (deixa o cron de hora em hora cuidar).
  if (aguardando === 0) {
    return { ok: true, aguardando: 0, forcado: false, travadas };
  }

  // Só força enquanto a manifestação é recente (até 30 min), no máximo uma vez
  // a cada 10 min (podeForcar). Depois disso quem completa é a busca de hora em
  // hora: bater de 15 em 15 min por 3 horas arriscava o "656" (NFE-02).
  const recente = agora - manifestMaisNova < 30 * 60 * 1000;
  if (!recente) {
    return { ok: true, aguardando, forcado: false, motivo: "fica pra busca de hora em hora" };
  }
  if (!podeForcar(cfg, false).ok) {
    return {
      ok: true,
      aguardando,
      forcado: false,
      motivo: "aguardando intervalo mínimo",
    };
  }

  const r = await rodarBuscaSefaz(admin, cfg, { forcar: true });
  return { ok: !r.erro, aguardando, forcado: true, ...r };
}
