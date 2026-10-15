// Quando o app da equipe avisa no celular (etapa 2 do Motelli Equipe).
// Cada função monta o texto e chama notificarColaboradores; todas engolem
// erro — avisar é extra, nunca pode travar a ação de quem chamou.
import { createAdminClient } from "@/lib/supabase/admin";
import { notificarColaboradores, pushConfigurado } from "@/lib/push";
import { ehPara, lembretesDaPessoa, lerLembrete, valeNoDia, type Lembrete } from "@/lib/lembretes-core";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaCurto = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
};
export const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

type Colab = { id: string; checklist_setores: string[] | null; faz_contagem: boolean | null };

/** Lembrete novo (ou editado) que vale hoje: avisa quem ele pega. */
export async function avisarLembrete(lembreteId: string) {
  try {
    if (!pushConfigurado()) return;
    const admin = createAdminClient();
    const { data: row } = await admin.from("lembretes").select("*").eq("id", lembreteId).maybeSingle();
    if (!row) return;
    const l: Lembrete = lerLembrete(row as Record<string, unknown>);
    if (!valeNoDia(l, hojeSP())) return;
    const { data: colabs } = await admin.from("colaboradores").select("id, checklist_setores, faz_contagem")
      .eq("empresa_id", (row as { empresa_id: string }).empresa_id).eq("ativo", true);
    const ids = ((colabs as Colab[]) ?? []).filter((c) => ehPara(l, { id: c.id, setores: c.checklist_setores ?? [] })).map((c) => c.id);
    await notificarColaboradores(ids, {
      titulo: l.tipo === "tarefa" ? "Tarefa nova pra hoje" : "Lembrete novo",
      corpo: l.hora ? `${l.titulo} (${l.hora})` : l.titulo,
    });
  } catch { /* avisar é extra */ }
}

/** Folga aprovada ou negada: avisa quem pediu. */
export async function avisarFolgaDecidida(pedidoId: number) {
  try {
    if (!pushConfigurado()) return;
    const admin = createAdminClient();
    const { data } = await admin.from("folgas_pedidos").select("data, status, motivo_negativa, folgas_funcionarios(colaborador_id)").eq("id", pedidoId).maybeSingle();
    const p = data as { data: string; status: string; motivo_negativa: string | null; folgas_funcionarios: { colaborador_id: string | null } | { colaborador_id: string | null }[] | null } | null;
    const f = Array.isArray(p?.folgas_funcionarios) ? p?.folgas_funcionarios[0] : p?.folgas_funcionarios;
    if (!p || !f?.colaborador_id || (p.status !== "Aprovado" && p.status !== "Negado")) return;
    const dia = diaCurto(String(p.data).slice(0, 10));
    await notificarColaboradores([f.colaborador_id], p.status === "Aprovado"
      ? { titulo: "Folga aprovada", corpo: `Sua folga de ${dia} foi aprovada.` }
      : { titulo: "Folga não aprovada", corpo: `Sua folga de ${dia} não foi aprovada.${p.motivo_negativa ? ` Motivo: ${p.motivo_negativa}` : ""}` });
  } catch { /* avisar é extra */ }
}

/** Pagamento da semana lançado: avisa cada um com o valor. */
export async function avisarPagamentosSemana(itens: { colaboradorId: string; valor: number }[], rotuloSemana: string) {
  try {
    if (!pushConfigurado()) return;
    await Promise.all(itens.filter((i) => i.valor > 0).map((i) =>
      notificarColaboradores([i.colaboradorId], { titulo: "Pagamento da semana", corpo: `Seu pagamento (${rotuloSemana}) foi lançado: ${brl(i.valor)}.` })));
  } catch { /* avisar é extra */ }
}

/**
 * Resumo da manhã (cron): pra cada pessoa com o app, o que tem pra ela hoje —
 * lembretes do dia e, pra quem faz contagem, os pedidos que chegam hoje.
 * Quem não tem nada não recebe nada.
 */
export async function avisosDaManha(): Promise<{ pessoas: number; enviados: number }> {
  if (!pushConfigurado()) return { pessoas: 0, enviados: 0 };
  const admin = createAdminClient();
  const hoje = hojeSP();
  const { data: disp } = await admin.from("dispositivos_push").select("colaborador_id");
  const comApp = [...new Set(((disp as { colaborador_id: string }[]) ?? []).map((d) => d.colaborador_id))];
  if (comApp.length === 0) return { pessoas: 0, enviados: 0 };
  const [{ data: colabs }, { data: ls }, { data: peds }] = await Promise.all([
    admin.from("colaboradores").select("id, empresa_id, checklist_setores, faz_contagem").in("id", comApp).eq("ativo", true),
    admin.from("lembretes").select("*").eq("ativo", true),
    admin.from("pedidos").select("id, empresa_id, status, conf_colab_em, nao_veio_em, cobrar_conf, aviso_encerrado_em, dia_entrega:pedido_dia_entrega, fornecedores(nome)")
      .eq("cobrar_conf", true).is("conf_colab_em", null).is("nao_veio_em", null).is("aviso_encerrado_em", null).in("status", ["rascunho", "enviado"]),
  ]);
  const lembretes = ((ls as Record<string, unknown>[]) ?? []).map((r) => ({ empresa: String(r.empresa_id), l: lerLembrete(r) }));
  type Ped = { empresa_id: string; dia_entrega: string | null; fornecedores: { nome: string } | { nome: string }[] | null };
  const pedidosHoje = ((peds as Ped[]) ?? []).filter((p) => String(p.dia_entrega ?? "").slice(0, 10) === hoje);
  let pessoas = 0, enviados = 0;
  for (const c of (colabs as (Colab & { empresa_id: string })[]) ?? []) {
    const meus = lembretesDaPessoa(lembretes.filter((x) => x.empresa === c.empresa_id).map((x) => x.l), { id: c.id, setores: c.checklist_setores ?? [] }, hoje, new Set())
      .filter((x) => x.dia === hoje);
    const forn = c.faz_contagem
      ? pedidosHoje.filter((p) => p.empresa_id === c.empresa_id).map((p) => (Array.isArray(p.fornecedores) ? p.fornecedores[0]?.nome : p.fornecedores?.nome) ?? "fornecedor")
      : [];
    if (meus.length === 0 && forn.length === 0) continue;
    const partes: string[] = [];
    if (meus.length) partes.push(meus.length === 1 ? `Lembrete: ${meus[0].lembrete.titulo}` : `${meus.length} lembretes pra hoje`);
    if (forn.length) partes.push(`Chega hoje: ${forn.slice(0, 3).join(", ")}${forn.length > 3 ? ` e mais ${forn.length - 3}` : ""} — confira no app`);
    pessoas++;
    enviados += await notificarColaboradores([c.id], { titulo: "Bom dia! Pra hoje", corpo: partes.join(" · ") });
  }
  return { pessoas, enviados };
}
