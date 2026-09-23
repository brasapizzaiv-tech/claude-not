import { createAdminClient } from "@/lib/supabase/admin";
import type { FolgaMural, PedidoCompraMural } from "@/app/(painel)/mural/mural";
import type { Feriado } from "@/lib/feriados";
import type { Evento } from "@/lib/eventos";

// DADOS DO MURAL
//
// Os mesmos números aparecem em dois lugares: na tela do painel (com login) e
// na TV do escritório (só com a chave do link). Buscar duas vezes, em dois
// arquivos, era garantir que um dia um mostraria uma coisa e o outro, outra.
//
// Quem chama diz DE QUAL EMPRESA quer. No painel quem responde isso é o login
// (o cliente do usuário já vem filtrado pelas regras do banco); na TV, a
// própria chave — ela pertence a uma empresa só.

/** Quantos dias pra frente a TV mostra de escala. */
export const DIAS_DE_ESCALA = 45;

/** Hoje em São Paulo, no formato AAAA-MM-DD (é o formato das datas de folga). */
export function hojeSp() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function daquiA(hoje: string, dias: number) {
  const d = new Date(`${hoje}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("en-CA");
}

/** A empresa dona desta chave, ou null se a chave não existe. */
export async function empresaDaChaveMural(chave: string): Promise<string | null> {
  const limpa = (chave ?? "").trim();
  if (limpa.length < 16) return null; // chave curta demais nem vai ao banco
  const admin = createAdminClient();
  const { data } = await admin
    .from("mural_config")
    .select("empresa_id")
    .eq("chave", limpa)
    .maybeSingle();
  return (data as { empresa_id: string } | null)?.empresa_id ?? null;
}

type Cliente = ReturnType<typeof createAdminClient>;

/**
 * Busca o que o mural mostra. `empresaId` só é usado quando a busca vem pela
 * chave (cliente administrativo, que passa por cima das regras do banco); com
 * o cliente do usuário logado ele é dispensável, porque as regras já cortam.
 */
export async function dadosDoMural(supabase: Cliente, empresaId?: string) {
  const hoje = hojeSp();
  const daqui = daquiA(hoje, DIAS_DE_ESCALA);
  // Quem chega pela chave da TV não tem login, então o cliente administrativo
  // passa por cima das regras do banco: aqui a empresa vira filtro na mão. O
  // filtro entra ANTES do .order(), que é até onde o construtor aceita
  // condição.
  let qFolgas = supabase
    .from("folgas_pedidos")
    .select("id, funcionario_id, data, motivo, status, origem, grupo_alvo, criado_em")
    // Pendentes de qualquer data (as de datas passadas são justamente as
    // esquecidas) e aprovadas dos próximos 45 dias.
    .or(`status.eq.Pendente,and(status.eq.Aprovado,data.gte.${hoje},data.lte.${daqui})`);
  let qEquipe = supabase
    .from("folgas_funcionarios")
    .select("id, nome, grupo, grupo2, funcao, gerente")
    .eq("ativo", true);
  let qCompras = supabase
    .from("solicitacoes_compra")
    .select("id, nome, item, quantidade, motivo, urgente, status, tipo, criado_em, respondido_em");
  let qEventos = supabase
    .from("eventos")
    .select("id, data, hora, titulo, pessoas, lugar, contato, telefone, cardapio, observacao, status")
    .neq("status", "cancelado")
    .gte("data", hoje)
    .lte("data", daquiA(hoje, 120));
  let qFeriados = supabase
    .from("feriados")
    .select("id, data, data_fim, nome, situacao, detalhe")
    .or(`data_fim.gte.${hoje},and(data_fim.is.null,data.gte.${hoje})`)
    .lte("data", daquiA(hoje, 120));
  if (empresaId) {
    qFolgas = qFolgas.eq("empresa_id", empresaId);
    qEquipe = qEquipe.eq("empresa_id", empresaId);
    qCompras = qCompras.eq("empresa_id", empresaId);
    qFeriados = qFeriados.eq("empresa_id", empresaId);
    qEventos = qEventos.eq("empresa_id", empresaId);
  }

  const [{ data: pedidos }, { data: equipe }, { data: compras }, { data: datas }, { data: marcados }] =
    await Promise.all([
      qFolgas.order("data"),
      qEquipe,
      qCompras.order("criado_em", { ascending: false }).limit(40),
      qFeriados.order("data").limit(6),
      qEventos.order("data").limit(6),
    ]);

  const quem = new Map<number, { nome: string; grupo: string; gerente: boolean }>();
  for (const f of (equipe as { id: number; nome: string; grupo: string; gerente: boolean }[]) ?? []) {
    quem.set(f.id, { nome: f.nome, grupo: f.grupo, gerente: !!f.gerente });
  }

  const folgas: FolgaMural[] = ((pedidos as Record<string, unknown>[]) ?? []).map((p) => {
    const f = quem.get(Number(p.funcionario_id));
    return {
      id: Number(p.id),
      nome: f?.nome ?? "—",
      grupo: (p.grupo_alvo as string | null) ?? f?.grupo ?? "",
      gerente: f?.gerente ?? false,
      data: String(p.data).slice(0, 10),
      motivo: (p.motivo as string | null) ?? null,
      status: String(p.status) as FolgaMural["status"],
      origem: String(p.origem ?? "app"),
      criadoEm: (p.criado_em as string | null) ?? null,
    };
  });

  const solicitacoes: PedidoCompraMural[] = ((compras as Record<string, unknown>[]) ?? []).map((s) => ({
    id: Number(s.id),
    nome: String(s.nome ?? "—"),
    item: String(s.item ?? ""),
    quantidade: (s.quantidade as string | null) ?? null,
    motivo: (s.motivo as string | null) ?? null,
    urgente: !!s.urgente,
    status: String(s.status ?? "pendente"),
    tipo: String(s.tipo ?? "compra"),
    criadoEm: (s.criado_em as string | null) ?? null,
    respondidoEm: (s.respondido_em as string | null) ?? null,
  }));

  const feriados: Feriado[] = ((datas as Record<string, unknown>[]) ?? []).map((f) => ({
    id: String(f.id),
    data: String(f.data).slice(0, 10),
    dataFim: (f.data_fim as string | null) ?? null,
    nome: String(f.nome ?? ""),
    situacao: String(f.situacao ?? "indefinido") as Feriado["situacao"],
    detalhe: (f.detalhe as string | null) ?? null,
  }));

  const eventos: Evento[] = ((marcados as Record<string, unknown>[]) ?? []).map((e) => ({
    id: String(e.id),
    data: String(e.data).slice(0, 10),
    hora: (e.hora as string | null) ?? null,
    titulo: String(e.titulo ?? ""),
    pessoas: Number(e.pessoas ?? 0),
    lugar: (e.lugar as string | null) ?? null,
    contato: (e.contato as string | null) ?? null,
    telefone: (e.telefone as string | null) ?? null,
    cardapio: (e.cardapio as string | null) ?? null,
    observacao: (e.observacao as string | null) ?? null,
    status: String(e.status ?? "marcado") as Evento["status"],
  }));

  return { folgas, solicitacoes, feriados, eventos, hoje };
}
