import { createAdminClient } from "@/lib/supabase/admin";
import { addDiasIso, diaSemanaIso } from "@/lib/dia-cardapio";

// Cardápio das marmitas Kern numa data — lê o MESMO cadastro do app das
// marmitas (mkt_config.cardapios: 4 semanas em rotação + programação por
// segunda-feira). A regra de "qual semana vale" é a mesma de
// src/app/api/marmitas/[[...rota]]/route.ts (semanaPara), copiada aqui porque
// rota não se importa de fora.
//
// EXCEÇÃO POR DATA (marmitas_dia_excecao): a cozinha pode trocar o cardápio de
// UM dia sem mexer na rotação. Vale pro app do convênio e pra TV. Só pode ser
// gravada enquanto a janela de pedidos daquele dia ainda não abriu — depois
// disso os pedidos já feitos ficariam com itens fora do cardápio.

export type KernDia = {
  data: string;
  pratos: string[];
  proteinas: string[];
  salada: string;
  quantidade: number;     // pedidos já feitos pra esse dia
  // Quantas pessoas escolheram cada prato e cada proteína, pela CHAVE
  // normalizada (minúscula, sem espaço nas pontas) — é o que a cozinha precisa
  // pra saber quantas de cada fazer. Vazio antes do primeiro pedido do dia.
  escolhas: Record<string, number>;
  // Quantas MARMITAS vão pra cada loja do convênio. A cozinha embala por
  // destino: o total sozinho não diz quantas viandas entram em cada caixa.
  // Da maior pra menor, só as lojas que pediram hoje.
  porLoja: { loja: string; n: number }[];
  // Quantas saladas vão pra cada loja do convênio (Matriz, Centro, ADM, CD).
  // A cozinha embala por destino, então precisa da divisão — não só do total.
  // Só entram as lojas que pediram salada hoje, da maior pra menor.
  saladaPorLoja: { loja: string; n: number }[];
  horaEntrega: string;    // "11:00"
  nomeConvenio: string;
  bloqueado: string | null; // motivo (feriado) quando não tem marmita
  excecao: boolean;       // este dia tem cardápio próprio (fora da rotação)
  rotacao: { pratos: string[]; proteinas: string[]; salada: string; semana: string | null }; // o que a rotação daria
};

export type ExcecaoMarmita = { pratos: string[]; proteinas: string[]; salada: string; por_nome: string | null; atualizado_em: string };

type Semana = { id: string; nome: string; dias: Record<string, { pratos?: string[]; proteinas?: string[]; salada?: string }> };
type Cardapios = { semanas: Semana[]; ativo: string | null; programacao?: Record<string, string> };

const CHAVE_DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

function segundaDe(iso: string) {
  const dow = diaSemanaIso(iso);
  return addDiasIso(iso, dow === 0 ? -6 : 1 - dow);
}
function hojeSP() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function agoraSP() {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date());
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "00";
  return { data: `${g("year")}-${g("month")}-${g("day")}`, hora: `${g("hour").replace("24", "00")}:${g("minute")}` };
}
function semanaPara(c: Cardapios, iso: string): Semana | null {
  const semanas = Array.isArray(c.semanas) ? c.semanas : [];
  if (!semanas.length) return null;
  const seg = segundaDe(iso);
  let ancDesde: string | null = null, ancId: string | null = null;
  for (const [desde, id] of Object.entries(c.programacao || {})) {
    if (desde <= seg && (!ancDesde || desde > ancDesde)) { ancDesde = desde; ancId = id; }
  }
  if (!ancDesde) { ancDesde = segundaDe(hojeSP()); ancId = c.ativo; }
  const idx = semanas.findIndex((s) => s.id === ancId);
  if (idx < 0) return null;
  const dif = Math.round((Date.parse(seg + "T00:00:00Z") - Date.parse(ancDesde + "T00:00:00Z")) / (7 * 86400000));
  const n = semanas.length;
  return semanas[(((idx + dif) % n) + n) % n];
}

const lista = (v: unknown) => (Array.isArray(v) ? v : []).map(String).map((s) => s.trim()).filter(Boolean);

type CfgKern = { cardapios: Cardapios; bloqueios: { data: string; motivo: string }[]; horaAbertura: string; horaLimite: string; horaEntrega: string; nomeConvenio: string };

async function lerCfgKern(admin: ReturnType<typeof createAdminClient>): Promise<CfgKern> {
  const { data: cfgRows } = await admin.from("mkt_config").select("chave, valor").in("chave", ["cardapios", "horaEntrega", "horaAbertura", "horaLimite", "nomeConvenio", "bloqueios"]);
  const m: Record<string, string> = {};
  for (const r of (cfgRows as { chave: string; valor: string }[]) ?? []) m[r.chave] = r.valor;
  let cardapios: Cardapios = { semanas: [], ativo: null };
  try { cardapios = JSON.parse(m.cardapios || "{}") as Cardapios; } catch { /* sem cadastro */ }
  let bloqueios: { data: string; motivo: string }[] = [];
  try {
    const b = JSON.parse(m.bloqueios || "[]") as { data?: string; motivo?: string }[];
    bloqueios = (Array.isArray(b) ? b : []).filter((x) => x && typeof x.data === "string").map((x) => ({ data: x.data as string, motivo: String(x.motivo || "sem marmita") }));
  } catch { /* sem bloqueios */ }
  return { cardapios, bloqueios, horaAbertura: m.horaAbertura || "14:00", horaLimite: m.horaLimite || "08:30", horaEntrega: m.horaEntrega || "11:00", nomeConvenio: m.nomeConvenio || "Kern" };
}

export async function lerExcecaoMarmita(admin: ReturnType<typeof createAdminClient>, iso: string): Promise<ExcecaoMarmita | null> {
  const { data } = await admin.from("marmitas_dia_excecao").select("pratos, proteinas, salada, por_nome, atualizado_em").eq("data", iso).maybeSingle();
  if (!data) return null;
  const r = data as { pratos: unknown; proteinas: unknown; salada: string; por_nome: string | null; atualizado_em: string };
  return { pratos: lista(r.pratos), proteinas: lista(r.proteinas), salada: String(r.salada ?? "").trim(), por_nome: r.por_nome, atualizado_em: r.atualizado_em };
}

/** Chave de comparação entre o nome no cardápio e o nome no pedido: a mesma
 *  usada pela rota das marmitas pra achar item fora do cardápio. */
const chaveItem = (s: string) => String(s ?? "").trim().toLowerCase();

/** Os pratos de um pedido, venham como lista ou como texto com a lista
 *  dentro. Devolve vazio em qualquer formato que eu não reconheça, em vez de
 *  quebrar a TV. */
function listaDoPedido(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const j = JSON.parse(v);
      return Array.isArray(j) ? j.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Quantas pessoas escolheram cada prato e cada proteína no dia, e quantas
 *  saladas vão pra cada loja do convênio. */
async function contarEscolhas(
  admin: ReturnType<typeof createAdminClient>,
  iso: string,
): Promise<{
  conta: Record<string, number>;
  porLoja: { loja: string; n: number }[];
  saladaPorLoja: { loja: string; n: number }[];
}> {
  const { data } = await admin
    .from("mkt_pedidos")
    .select("pratos, proteina, salada, filial")
    .eq("data", iso);
  const conta: Record<string, number> = {};
  const marmitasPorLoja: Record<string, number> = {};
  const saladasPorLoja: Record<string, number> = {};
  const somar = (nome: unknown) => {
    const k = chaveItem(nome as string);
    if (k) conta[k] = (conta[k] ?? 0) + 1;
  };
  for (const p of (data as { pratos: unknown; proteina: unknown; salada: unknown; filial: unknown }[]) ?? []) {
    // Uma marmita pode levar mais de um prato; a proteína é uma só.
    //
    // `pratos` é uma coluna de TEXTO com a lista escrita dentro
    // (`["Arroz Branco","Feijão"]`), não uma lista de verdade — foi assim que
    // a tabela nasceu. Tratar só como lista fazia a conta dos pratos dar zero
    // sem reclamar de nada.
    const loja = String(p.filial ?? "").trim() || "Sem loja";
    // Toda marmita conta pra loja dela, tenha levado salada ou não.
    marmitasPorLoja[loja] = (marmitasPorLoja[loja] ?? 0) + 1;

    for (const x of listaDoPedido(p.pratos)) somar(x);
    somar(p.proteina);
    // A salada do dia é uma só: quem não quis vem em branco. Então este
    // número é "quantos levaram salada", não "qual salada escolheram".
    somar(p.salada);

    // Esta outra divisão vale só pra quem levou salada.
    if (chaveItem(p.salada as string)) {
      saladasPorLoja[loja] = (saladasPorLoja[loja] ?? 0) + 1;
    }
  }
  const emLista = (r: Record<string, number>) =>
    Object.entries(r)
      .map(([loja, n]) => ({ loja, n }))
      .sort((a, b) => b.n - a.n);
  return { conta, porLoja: emLista(marmitasPorLoja), saladaPorLoja: emLista(saladasPorLoja) };
}

export async function kernDoDia(iso: string): Promise<KernDia> {
  const admin = createAdminClient();
  const [cfg, { count }, exc, escolhas] = await Promise.all([
    lerCfgKern(admin),
    admin.from("mkt_pedidos").select("id", { count: "exact", head: true }).eq("data", iso),
    lerExcecaoMarmita(admin, iso),
    contarEscolhas(admin, iso),
  ]);
  const { conta: escolhasPorItem, porLoja, saladaPorLoja } = escolhas;
  const hit = cfg.bloqueios.find((x) => x.data === iso);
  const sem = semanaPara(cfg.cardapios, iso);
  const dia = sem?.dias?.[CHAVE_DIA[diaSemanaIso(iso)]];
  const rotacao = { pratos: lista(dia?.pratos), proteinas: lista(dia?.proteinas), salada: String(dia?.salada ?? "").trim(), semana: sem?.nome ?? null };
  const vale = exc ?? rotacao;
  return {
    data: iso,
    pratos: vale.pratos,
    proteinas: vale.proteinas,
    salada: vale.salada,
    quantidade: count ?? 0,
    escolhas: escolhasPorItem,
    porLoja,
    saladaPorLoja,
    horaEntrega: cfg.horaEntrega,
    nomeConvenio: cfg.nomeConvenio,
    bloqueado: hit ? hit.motivo : null,
    excecao: !!exc,
    rotacao,
  };
}

// Quando abre a janela de pedidos pro dia de entrega D: às `horaAbertura` do
// último dia de entrega antes de D (sábado pra segunda; véspera do feriado).
// Mesma regra de janelaPedido() na rota do app das marmitas.
export function aberturaPedidosMarmita(cfg: { horaAbertura: string; bloqueios: { data: string }[] }, iso: string) {
  const semEntrega = (d: string) => diaSemanaIso(d) === 0 || cfg.bloqueios.some((b) => b.data === d);
  let vespera = addDiasIso(iso, -1);
  for (let i = 0; i < 30 && semEntrega(vespera); i++) vespera = addDiasIso(vespera, -1);
  return { data: vespera, hora: cfg.horaAbertura };
}

// Pode trocar o cardápio da marmita deste dia? Só ANTES da janela de pedidos
// abrir — e nunca com pedido já feito.
export async function podeEditarMarmita(iso: string): Promise<{ ok: true; abreEm: { data: string; hora: string } } | { ok: false; motivo: string; abreEm: { data: string; hora: string } }> {
  const admin = createAdminClient();
  const [cfg, { count }] = await Promise.all([
    lerCfgKern(admin),
    admin.from("mkt_pedidos").select("id", { count: "exact", head: true }).eq("data", iso),
  ]);
  const abreEm = aberturaPedidosMarmita(cfg, iso);
  const ag = agoraSP();
  const jaAbriu = ag.data > abreEm.data || (ag.data === abreEm.data && ag.hora >= abreEm.hora);
  if ((count ?? 0) > 0) return { ok: false, motivo: `Já tem ${count} pedido(s) pra esse dia — o cardápio não pode mais mudar.`, abreEm };
  if (jaAbriu) return { ok: false, motivo: `Os pedidos desse dia já abriram (${abreEm.data.split("-").reverse().slice(0, 2).join("/")} às ${abreEm.hora}) — o cardápio não pode mais mudar.`, abreEm };
  return { ok: true, abreEm };
}

// Grava a exceção do dia (lista vazia nas duas = volta pra rotação).
export async function salvarExcecaoMarmita(iso: string, dados: { pratos: string[]; proteinas: string[]; salada: string }, porNome: string) {
  const pode = await podeEditarMarmita(iso);
  if (!pode.ok) return { ok: false as const, mensagem: pode.motivo };
  const admin = createAdminClient();
  const pratos = lista(dados.pratos).slice(0, 12);
  const proteinas = lista(dados.proteinas);
  const salada = String(dados.salada ?? "").trim().slice(0, 80);
  if (pratos.length === 0 && proteinas.length === 0) {
    const { error } = await admin.from("marmitas_dia_excecao").delete().eq("data", iso);
    if (error) return { ok: false as const, mensagem: error.message };
    return { ok: true as const, removida: true as const };
  }
  const { error } = await admin
    .from("marmitas_dia_excecao")
    .upsert({ data: iso, pratos, proteinas, salada, por_nome: porNome || null, atualizado_em: new Date().toISOString() }, { onConflict: "empresa_id,data" });
  if (error) return { ok: false as const, mensagem: error.message };
  return { ok: true as const, removida: false as const };
}
