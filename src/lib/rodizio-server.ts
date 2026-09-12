import { createAdminClient } from "@/lib/supabase/admin";
import { PRONTO_SOME_SEG, type PedidoRodizio } from "@/lib/rodizio";

// Fila do rodízio pra TV (cliente administrativo: a TV não tem login).
// Pendentes e no forno de qualquer hora + prontos recentes (a TV mostra por 90 s).
export async function filaTv(): Promise<PedidoRodizio[]> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - (PRONTO_SOME_SEG + 30) * 1000).toISOString();
  const { data, error } = await admin
    .from("pedidos_rodizio")
    .select("id, mesa, sabor, tipo, fracao, quantidade, observacao, status, criado_em, forno_em, pronto_em, garcom")
    .or(`status.in.(pendente,forno),and(status.eq.pronto,pronto_em.gte.${desde})`)
    .order("criado_em", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data as PedidoRodizio[]) ?? [];
}

export function chaveTvOk(chave: string | undefined) {
  const esperada = (process.env.RODIZIO_TV_CHAVE ?? "").trim();
  return { configurada: !!esperada, ok: !!esperada && (chave ?? "") === esperada };
}

// Hora atual (fora do componente por causa da regra de pureza do React).
export const agoraMs = () => Date.now();

// Recados ativos pra tela de descanso da TV (some sozinho depois da data "ate").
export async function recadosTv(): Promise<{ id: string; texto: string }[]> {
  const admin = createAdminClient();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { data } = await admin
    .from("tv_recados")
    .select("id, texto, ordem, criado_em")
    .eq("ativo", true)
    .or(`ate.is.null,ate.gte.${hoje}`)
    .order("ordem")
    .order("criado_em")
    .limit(5);
  return ((data as { id: string; texto: string }[]) ?? []).map((r) => ({ id: r.id, texto: r.texto }));
}

// Temperatura em Ivoti (Open-Meteo, grátis e sem chave). O relógio de parede
// que a TV substituiu mostrava a temperatura; sem sensor, vale a da previsão.
// Guardada 10 min; se a consulta falhar, a TV simplesmente não mostra.
let climaCache: { temp: number | null; em: number } = { temp: null, em: 0 };
export async function temperaturaIvoti(): Promise<number | null> {
  if (Date.now() - climaCache.em < 10 * 60 * 1000) return climaCache.temp;
  try {
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=-29.5906&longitude=-51.1606&current=temperature_2m&timezone=America%2FSao_Paulo", { signal: AbortSignal.timeout(4000), cache: "no-store" });
    const j = (await r.json()) as { current?: { temperature_2m?: number } };
    const t = j.current?.temperature_2m;
    climaCache = { temp: typeof t === "number" ? t : null, em: Date.now() };
  } catch {
    climaCache = { temp: climaCache.temp, em: Date.now() - 8 * 60 * 1000 }; // tenta de novo em 2 min
  }
  return climaCache.temp;
}
