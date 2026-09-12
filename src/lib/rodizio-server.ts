import { createAdminClient } from "@/lib/supabase/admin";
import { diaDoCardapio, diaSemanaIso } from "@/lib/dia-cardapio";
import { kernDoDia } from "@/lib/marmitas-cardapio";
import type { CardapioTv } from "@/components/tv-cardapio";
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

// Aniversariantes do mês (colaboradores ativos com data de nascimento), pra
// tela de descanso da TV. Só nome e dia — nada de idade nem data completa.
export type AniversarianteTv = { nome: string; dia: number; hoje: boolean };
export async function aniversariantesMes(): Promise<AniversarianteTv[]> {
  const admin = createAdminClient();
  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const mes = Number(hojeIso.slice(5, 7)), diaHoje = Number(hojeIso.slice(8, 10));
  const { data } = await admin.from("colaboradores").select("nome, nascimento").eq("ativo", true).not("nascimento", "is", null);
  return ((data as { nome: string; nascimento: string }[]) ?? [])
    .filter((c) => Number(c.nascimento.slice(5, 7)) === mes)
    .map((c) => ({ nome: c.nome.trim().split(/\s+/).slice(0, 2).join(" "), dia: Number(c.nascimento.slice(8, 10)), hoje: Number(c.nascimento.slice(8, 10)) === diaHoje }))
    .sort((a, b) => a.dia - b.dia);
}

// Cardápio que a TV mostra fora da fila: buffet do dia (cardapio_dia, o mesmo
// do site), saladas marcadas (cardapio_dia_saladas) e marmitas Kern — todos do
// dia que VALE AGORA (diaDoCardapio: vira às 13:30, pula domingo). Guardado
// 30 s: a TV pergunta a cada 3 s e isso não muda de segundo em segundo.
const ORDEM_SALADAS = ["Folhas", "Maioneses", "Cozidas", "Cruas", "Grãos", "Conservas", "Outros"];
let cardapioCache: { dia: string; em: number; valor: CardapioTv } | null = null;
export async function cardapioTv(agora = Date.now()): Promise<CardapioTv> {
  const dia = diaDoCardapio(agora);
  if (cardapioCache && cardapioCache.dia === dia && agora - cardapioCache.em < 30_000) return cardapioCache.valor;
  const admin = createAdminClient();
  const [{ data: cd }, { data: salDia }, { data: salSemana }, kern] = await Promise.all([
    admin.from("cardapio_dia").select("proteinas, carboidratos, especial, publicado").eq("data", dia).maybeSingle(),
    admin.from("cardapio_dia_saladas").select("saladas_base(nome, categoria, ativo)").eq("data", dia),
    admin.from("saladas_semana").select("saladas_base(nome, categoria, ativo)").eq("dow", diaSemanaIso(dia)),
    kernDoDia(dia).catch(() => null),
  ]);
  // Seleção própria da data vale; senão, o padrão do dia da semana (folha da cozinha).
  const sal = (salDia && salDia.length > 0) ? salDia : salSemana;
  const linhas = (t: string | null) => (t ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const c = cd as { proteinas: string | null; carboidratos: string | null; especial: string | null; publicado: boolean } | null;
  const buffet = c ? { proteinas: linhas(c.proteinas), carboidratos: linhas(c.carboidratos), especial: linhas(c.especial), publicado: !!c.publicado } : null;
  const grupos = new Map<string, string[]>();
  type SalRow = { saladas_base: { nome: string; categoria: string; ativo: boolean } | { nome: string; categoria: string; ativo: boolean }[] | null };
  for (const r of ((sal as unknown as SalRow[]) ?? [])) {
    const s = Array.isArray(r.saladas_base) ? r.saladas_base[0] : r.saladas_base;
    if (!s || !s.ativo) continue;
    if (!grupos.has(s.categoria)) grupos.set(s.categoria, []);
    grupos.get(s.categoria)!.push(s.nome);
  }
  const saladas = ORDEM_SALADAS.filter((g) => grupos.has(g)).map((g) => ({ categoria: g, itens: grupos.get(g)!.sort((a, b) => a.localeCompare(b, "pt-BR")) }));
  const valor: CardapioTv = { dia, buffet, saladas: saladas.length ? saladas : null, kern };
  cardapioCache = { dia, em: agora, valor };
  return valor;
}

// Última mexida no rodízio (criado/forno/pronto/cancelado): a TV só volta pro
// cardápio depois de TV_SEM_PEDIDO_MIN sem nada aberto.
export async function ultimaAtividadeRodizio(): Promise<string | null> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data } = await admin
    .from("pedidos_rodizio")
    .select("criado_em, forno_em, pronto_em, cancelado_em")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(50);
  let max = 0;
  for (const r of (data as Record<string, string | null>[]) ?? []) {
    for (const k of ["criado_em", "forno_em", "pronto_em", "cancelado_em"]) {
      const t = r[k] ? Date.parse(r[k] as string) : 0;
      if (t > max) max = t;
    }
  }
  return max ? new Date(max).toISOString() : null;
}
