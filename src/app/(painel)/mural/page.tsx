import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { Mural, type FolgaMural, type PedidoCompraMural } from "./mural";

export const metadata = { title: "Mural do escritório · Brasa" };
export const dynamic = "force-dynamic";

// MURAL DO ESCRITÓRIO
//
// Irmã da TV da cozinha, mas para outro tipo de espera. A TV mostra o que
// precisa sair AGORA; aqui o assunto é o que precisa de uma RESPOSTA sua:
// alguém pediu folga e está esperando, alguém pediu uma compra e está
// esperando. Sem isso, os dois só apareciam quando o Rafael lembrava de abrir
// a tela certa.
//
// Três blocos, nesta ordem de propósito:
//   1. o que espera resposta  (é por isso que a tela existe)
//   2. as folgas que vêm aí   (planejar a escala)
//   3. os pedidos de compra   (o que já foi resolvido, pra dar o contexto)
export default async function MuralPage() {
  await exigirAcesso("/mural");
  const supabase = await createClient();

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const daquiA = (dias: number) => {
    const d = new Date(`${hoje}T12:00:00`);
    d.setDate(d.getDate() + dias);
    return d.toLocaleDateString("en-CA");
  };

  const [{ data: pedidos }, { data: equipe }, { data: compras }] = await Promise.all([
    supabase
      .from("folgas_pedidos")
      .select("id, funcionario_id, data, motivo, status, origem, grupo_alvo, criado_em")
      // Pendentes de qualquer data (até as de datas passadas, que são
      // justamente as esquecidas) e aprovadas dos próximos 45 dias.
      .or(`status.eq.Pendente,and(status.eq.Aprovado,data.gte.${hoje},data.lte.${daquiA(45)})`)
      .order("data"),
    supabase.from("folgas_funcionarios").select("id, nome, grupo, grupo2, funcao, gerente").eq("ativo", true),
    supabase
      .from("solicitacoes_compra")
      .select("id, nome, item, quantidade, motivo, urgente, status, tipo, criado_em, respondido_em")
      .order("criado_em", { ascending: false })
      .limit(40),
  ]);

  const nomeDe = new Map<number, { nome: string; grupo: string; grupo2: string | null; gerente: boolean }>();
  for (const f of (equipe as { id: number; nome: string; grupo: string; grupo2: string | null; gerente: boolean }[]) ?? []) {
    nomeDe.set(f.id, { nome: f.nome, grupo: f.grupo, grupo2: f.grupo2, gerente: !!f.gerente });
  }

  const folgas: FolgaMural[] = ((pedidos as Record<string, unknown>[]) ?? []).map((p) => {
    const f = nomeDe.get(Number(p.funcionario_id));
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

  return <Mural folgas={folgas} solicitacoes={solicitacoes} hoje={hoje} />;
}
