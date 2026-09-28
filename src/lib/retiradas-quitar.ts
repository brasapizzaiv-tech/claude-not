import type { createClient } from "@/lib/supabase/server";

// Receber PARTE do fiado (compras internas) de uma pessoa.
//
// Até 28/09/2026 só dava pra quitar tudo de uma vez — no /retiradas ("Quitar")
// e no acerto da semana, que pegava compras inteiras enquanto coubessem. Tem
// gente que paga aos poucos, então agora se recebe um valor: as compras mais
// antigas são quitadas inteiras enquanto o valor dá; a primeira que não cabe
// inteira é DIVIDIDA — a parte paga vira uma linha "pago" com a mesma
// descrição, e o resto continua em aberto na linha original. A soma nunca
// muda, então "comprado", "pago" e "em aberto" seguem batendo em toda tela.
//
// Em duas etapas (planejar → aplicar) porque o acerto da semana precisa saber
// o valor ANTES de gravar a conta e só marca as compras depois.

type Db = Awaited<ReturnType<typeof createClient>>;
type Aberta = { id: number; valor: number };
export type PlanoFiado = {
  colaboradorId: string;
  recebido: number;               // o que de fato será abatido (≤ alvo, ≤ em aberto)
  inteiras: number[];             // ids quitados por inteiro
  parcial: { id: number; valor: number; pagar: number } | null; // a que é dividida
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function planejarRecebimentoFiado(db: Db, colaboradorId: string, valorAlvo: number): Promise<PlanoFiado> {
  const plano: PlanoFiado = { colaboradorId, recebido: 0, inteiras: [], parcial: null };
  let restante = r2(Math.max(0, valorAlvo));
  if (restante <= 0) return plano;
  const { data } = await db
    .from("retiradas")
    .select("id, valor")
    .eq("colaborador_id", colaboradorId)
    .eq("status", "aberto")
    .order("data", { ascending: true })
    .order("id", { ascending: true });
  for (const r of (data ?? []) as Aberta[]) {
    const v = r2(Number(r.valor) || 0);
    if (v <= 0) { plano.inteiras.push(r.id); continue; } // compra sem valor: só limpa
    if (restante + 0.005 >= v) {
      plano.inteiras.push(r.id);
      restante = r2(restante - v);
      if (restante <= 0.005) { restante = 0; break; }
    } else {
      plano.parcial = { id: r.id, valor: v, pagar: restante };
      restante = 0;
      break;
    }
  }
  plano.recebido = r2(Math.max(0, valorAlvo) - restante);
  return plano;
}

export async function aplicarRecebimentoFiado(db: Db, plano: PlanoFiado, dataPagamento: string, obs: string | null) {
  if (plano.inteiras.length) {
    const { error } = await db
      .from("retiradas")
      .update({ status: "pago", data_pagamento: dataPagamento, obs_pagamento: obs })
      .in("id", plano.inteiras);
    if (error) return { erro: error.message };
  }
  if (plano.parcial) {
    const { id, valor, pagar } = plano.parcial;
    const { data: orig, error: e1 } = await db
      .from("retiradas")
      .select("colaborador_id, nome, produto_id, item, data, observacao, criado_por")
      .eq("id", id)
      .single();
    if (e1 || !orig) return { erro: e1?.message ?? "compra não encontrada" };
    // Primeiro a cópia paga, depois encolhe a original — se falhar no meio,
    // sobra dinheiro em aberto, nunca dinheiro sumido.
    const { error: e2 } = await db.from("retiradas").insert({
      ...(orig as Record<string, unknown>),
      valor: pagar,
      peso: null,
      status: "pago",
      data_pagamento: dataPagamento,
      obs_pagamento: `${obs ? obs + " · " : ""}parte de ${valor.toFixed(2).replace(".", ",")}`,
    });
    if (e2) return { erro: e2.message };
    const { error: e3 } = await db.from("retiradas").update({ valor: r2(valor - pagar) }).eq("id", id);
    if (e3) return { erro: e3.message };
  }
  return { ok: true as const };
}

export async function receberFiado(db: Db, colaboradorId: string, valorAlvo: number, dataPagamento: string, obs: string | null) {
  const plano = await planejarRecebimentoFiado(db, colaboradorId, valorAlvo);
  if (plano.recebido <= 0) return { recebido: 0 };
  const r = await aplicarRecebimentoFiado(db, plano, dataPagamento, obs);
  if ("erro" in r) return { recebido: 0, erro: r.erro };
  return { recebido: plano.recebido };
}
