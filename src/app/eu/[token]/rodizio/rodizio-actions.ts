"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { MESAS_MAX, type PedidoRodizio, type FracaoRodizio } from "@/lib/rodizio";

// Garçom pelo app pessoal: colaborador ativo, com "faz garçom" e PIN batendo.
// (Mesma regra do modo garçom — o rodízio faz parte dele.)
export async function colabRodizio(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("id, nome, ativo, faz_garcom, pin")
    .eq("token", token)
    .maybeSingle();
  if (!data || !data.ativo || !data.faz_garcom) return null;
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  if (!data.pin || data.pin !== pin) return null;
  return { id: data.id as string, nome: data.nome as string };
}

export type SaborRodizio = { id: string; nome: string; tipo: "salgada" | "doce" };

export async function saboresRodizio(): Promise<SaborRodizio[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pdv_pizza_sabores")
    .select("id, nome, tipo")
    .eq("ativo", true)
    .eq("rodizio", true)
    .order("tipo")
    .order("nome");
  return ((data as { id: string; nome: string; tipo: string }[]) ?? []).map((s) => ({
    id: s.id,
    nome: s.nome.replace(/🆕/g, "").trim(),
    tipo: s.tipo === "doce" ? "doce" : "salgada",
  }));
}

// Pedidos abertos de uma mesa (pro garçom responder ao cliente).
export async function pedidosDaMesa(mesa: number): Promise<PedidoRodizio[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pedidos_rodizio")
    .select("id, mesa, sabor, tipo, fracao, quantidade, observacao, status, criado_em, forno_em, pronto_em, garcom")
    .eq("mesa", mesa)
    .in("status", ["pendente", "forno", "pronto"])
    .gte("criado_em", new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .order("criado_em", { ascending: false })
    .limit(30);
  return (data as PedidoRodizio[]) ?? [];
}

export async function lancarPedidoRodizio(
  token: string,
  input: { mesa: number; saborId: string; fracao: FracaoRodizio; quantidade: number; observacao: string },
) {
  const colab = await colabRodizio(token);
  if (!colab) return { ok: false as const, mensagem: "Entre com o PIN de novo." };

  const mesa = Math.round(Number(input.mesa));
  if (!(mesa >= 1 && mesa <= MESAS_MAX)) return { ok: false as const, mensagem: `Mesa de 1 a ${MESAS_MAX}.` };
  const fracao: FracaoRodizio = (["inteira", "meia", "quarto"] as const).includes(input.fracao) ? input.fracao : "inteira";
  const quantidade = Math.max(1, Math.min(20, Math.round(Number(input.quantidade) || 1)));

  const admin = createAdminClient();
  const { data: sabor } = await admin
    .from("pdv_pizza_sabores")
    .select("id, nome, tipo")
    .eq("id", input.saborId)
    .maybeSingle();
  if (!sabor) return { ok: false as const, mensagem: "Escolha o sabor na lista." };

  const { error } = await admin.from("pedidos_rodizio").insert({
    mesa,
    sabor: String(sabor.nome).replace(/🆕/g, "").trim(),
    sabor_id: sabor.id,
    tipo: sabor.tipo === "doce" ? "doce" : "salgada",
    fracao,
    quantidade,
    observacao: (input.observacao || "").trim().slice(0, 120) || null,
    colaborador_id: colab.id,
    garcom: colab.nome,
  });
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath(`/eu/${token}/rodizio`);
  return { ok: true as const };
}

// O garçom lançou errado e ainda não foi pro forno: pode desfazer.
export async function cancelarPedidoRodizio(token: string, id: string) {
  const colab = await colabRodizio(token);
  if (!colab) return { ok: false as const, mensagem: "Entre com o PIN de novo." };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pedidos_rodizio")
    .update({ status: "cancelado", cancelado_em: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pendente")
    .select("id");
  if (error) return { ok: false as const, mensagem: error.message };
  if (!data || data.length === 0) return { ok: false as const, mensagem: "Já foi pro forno — fale com a cozinha." };
  return { ok: true as const };
}
