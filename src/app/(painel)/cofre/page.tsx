import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { categoriasDeSangria } from "@/lib/sangria-financeiro";
import { CofreTela, type DadosCofre, type Pendente } from "./cofre-tela";
import type { Quantidades } from "@/lib/cofre";

export const metadata = { title: "Cofre" };
export const dynamic = "force-dynamic";

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function CofrePage() {
  await exigirAcesso("/cofre");
  const db = await createClient();

  const [{ data: faixasRows }, { data: saldoRows }, { data: cfg }, { data: pedidosRows }, { data: movRows }, categorias] = await Promise.all([
    db.from("cofre_denominacoes").select("centavos, minimo, maximo"),
    db.rpc("cofre_saldo"),
    db.from("cofre_config").select("inicio_em").maybeSingle(),
    db.from("cofre_pedidos").select("id, quantidades, valor, obs, criado_por_nome, criado_em").eq("status", "encomendado").order("criado_em"),
    db.from("cofre_movimentos").select("id, tipo, quantidades, valor, esperado, descricao, criado_por_nome, criado_em").order("criado_em", { ascending: false }).limit(60),
    categoriasDeSangria(db),
  ]);

  const saldo: Quantidades = {};
  for (const r of (saldoRows as { centavos: number; quantidade: number }[] | null) ?? []) if (Number(r.quantidade)) saldo[String(r.centavos)] = Number(r.quantidade);
  const faixas: DadosCofre["faixas"] = {};
  for (const r of (faixasRows as { centavos: number; minimo: number; maximo: number }[] | null) ?? []) faixas[String(r.centavos)] = { minimo: r.minimo, maximo: r.maximo };

  // O que saiu dos caixas e ainda não entrou no cofre (só depois do saldo inicial).
  const inicio = (cfg as { inicio_em: string | null } | null)?.inicio_em ?? null;
  const pendentes: Pendente[] = [];
  if (inicio) {
    const [{ data: fechados }, { data: abertos }, { data: sangrias }, { data: jaFeitos }] = await Promise.all([
      db.from("pdv_caixas").select("id, nome, aberto_em, fechado_em, dinheiro_contado, dinheiro_esperado").eq("status", "fechado").gte("fechado_em", inicio).order("fechado_em").limit(60),
      db.from("pdv_caixas").select("id, nome, aberto_em, saldo_inicial").gte("aberto_em", inicio).gt("saldo_inicial", 0).order("aberto_em").limit(60),
      db.from("pdv_caixa_mov").select("id, valor, descricao, criado_em").eq("tipo", "sangria").is("lancamento_id", null).gte("criado_em", inicio).order("criado_em").limit(100),
      db.from("cofre_movimentos").select("origem_tipo, origem_id").not("origem_id", "is", null).gte("criado_em", inicio).limit(1000),
    ]);
    const feito = new Set(((jaFeitos as { origem_tipo: string; origem_id: string }[] | null) ?? []).map((m) => `${m.origem_tipo}:${m.origem_id}`));
    for (const c of (abertos as { id: string; nome: string | null; aberto_em: string; saldo_inicial: number }[] | null) ?? []) {
      if (feito.has(`abertura:${c.id}`)) continue;
      pendentes.push({ origem: { tipo: "abertura", id: c.id, esperado: Number(c.saldo_inicial) }, tipo: "fundo_caixa", quando: c.aberto_em, rotulo: `Troco pra abrir o caixa (${hora(c.aberto_em)})`, valor: Number(c.saldo_inicial), sai: true });
    }
    for (const c of (fechados as { id: string; nome: string | null; fechado_em: string; dinheiro_contado: number | null; dinheiro_esperado: number | null }[] | null) ?? []) {
      if (feito.has(`caixa:${c.id}`)) continue;
      const v = Number(c.dinheiro_contado ?? c.dinheiro_esperado ?? 0);
      if (v <= 0) continue;
      pendentes.push({ origem: { tipo: "caixa", id: c.id, esperado: v }, tipo: "entrada_caixa", quando: c.fechado_em, rotulo: `Dinheiro do caixa fechado em ${hora(c.fechado_em)}`, valor: v, sai: false });
    }
    for (const s of (sangrias as { id: string; valor: number; descricao: string | null; criado_em: string }[] | null) ?? []) {
      if (feito.has(`sangria:${s.id}`)) continue;
      pendentes.push({ origem: { tipo: "sangria", id: s.id, esperado: Number(s.valor) }, tipo: "sangria", quando: s.criado_em, rotulo: `Sangria de ${hora(s.criado_em)}${s.descricao ? ` · ${s.descricao}` : ""}`, valor: Number(s.valor), sai: false });
    }
    pendentes.sort((a, b) => a.quando.localeCompare(b.quando));
  }

  const dados: DadosCofre = {
    iniciado: !!inicio,
    saldo,
    faixas,
    pendentes,
    pedidos: ((pedidosRows as { id: string; quantidades: Quantidades; valor: number; obs: string | null; criado_por_nome: string | null; criado_em: string }[] | null) ?? []).map((p) => ({ ...p, quando: hora(p.criado_em) })),
    movimentos: ((movRows as { id: string; tipo: string; quantidades: Quantidades; valor: number; esperado: number | null; descricao: string | null; criado_por_nome: string | null; criado_em: string }[] | null) ?? []).map((m) => ({ ...m, quando: hora(m.criado_em) })),
    categorias: categorias.map((c) => ({ id: c.id, nome: c.nome })),
  };

  return <CofreTela d={dados} />;
}
