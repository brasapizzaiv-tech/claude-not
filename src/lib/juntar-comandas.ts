// Juntar comandas da mesma pessoa no caixa. Na balança a pessoa pesa, volta, pesa
// de novo e aperta "livre": chega ao caixa com três cupons de um prato só. Fica a
// de menor número, e o caixa escolhe como cobrar o buffet.
//
// Apagar uma comanda apaga os itens dela no banco, por isso a ordem é sempre:
// mover os itens, conferir que saíram e só então apagar.
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export type ComandaJuntar = {
  id: string;
  numero: number;
  mesa: string | null;
  peso: number;
  tara: number;
  valor: number;
  livre: boolean;
  soKg: boolean;
  clienteId: string | null;
};

export type ModoJuntar = { tipo: "livre" } | { tipo: "somar" } | { tipo: "manter"; id: string };

/** O que vem das regras de preço do caixa (preço do dia e teto do livre). */
export type PrecoBuffet = {
  livreHoje: number;
  calcular: (peso: number, soKg: boolean) => { valor: number; livre: boolean };
};

type Falha = { ok: false; mensagem: string };

const redondo = (n: number, casas = 2) => Math.round(n * 10 ** casas) / 10 ** casas;
const numeros = (l: { numero: number }[]) => l.map((c) => `#${c.numero}`).join(", ");

/** Lê e confere as comandas: abertas, sem nenhum pagamento e fora do delivery. */
export async function lerParaJuntar(db: Db, ids: string[]): Promise<{ ok: true; comandas: ComandaJuntar[] } | Falha> {
  const unicos = [...new Set(ids)];
  if (unicos.length < 2 || unicos.length > 12 || unicos.some((i) => !/^[0-9a-f-]{36}$/i.test(i))) {
    return { ok: false, mensagem: "Escolha de 2 a 12 comandas para juntar." };
  }
  const { data, error } = await db
    .from("pdv_comandas")
    .select("id, numero, mesa, status, peso, tara, valor_buffet, livre, so_kg, cliente_id, buffet_pago, buffet_valor_pago, buffet_base_pago")
    .in("id", unicos);
  if (error) return { ok: false, mensagem: "Não consegui ler as comandas. Tente de novo." };
  const linhas = (data ?? []) as {
    id: string; numero: number; mesa: string | null; status: string; peso: number | null; tara: number | null; valor_buffet: number | null;
    livre: boolean | null; so_kg: boolean | null; cliente_id: string | null; buffet_pago: boolean | null; buffet_valor_pago: number | null; buffet_base_pago: number | null;
  }[];
  if (linhas.length !== unicos.length) return { ok: false, mensagem: "Uma das comandas não existe mais. Atualize a tela." };
  const fechadas = linhas.filter((c) => c.status !== "aberta");
  if (fechadas.length) return { ok: false, mensagem: `A comanda ${numeros(fechadas)} já foi fechada. Atualize a tela.` };

  const buffetPago = linhas.filter((c) => c.buffet_pago || Number(c.buffet_valor_pago ?? 0) > 0.005 || Number(c.buffet_base_pago ?? 0) > 0.005);
  const [{ data: itens, error: eItens }, { data: movs, error: eMovs }, { data: delivs, error: eDelivs }] = await Promise.all([
    db.from("pdv_comanda_itens").select("comanda_id, pago, valor_pago, base_pago").in("comanda_id", unicos),
    db.from("pdv_caixa_mov").select("comanda_id").in("comanda_id", unicos).eq("tipo", "venda"),
    db.from("delivery_pedidos").select("comanda_id").in("comanda_id", unicos),
  ]);
  if (eItens || eMovs || eDelivs) return { ok: false, mensagem: "Não consegui conferir as comandas. Tente de novo." };

  const comPagamento = new Set(buffetPago.map((c) => c.id));
  for (const i of (itens ?? []) as { comanda_id: string; pago: boolean | null; valor_pago: number | null; base_pago: number | null }[]) {
    if (i.pago || Number(i.valor_pago ?? 0) > 0.005 || Number(i.base_pago ?? 0) > 0.005) comPagamento.add(i.comanda_id);
  }
  for (const m of (movs ?? []) as { comanda_id: string }[]) comPagamento.add(m.comanda_id);
  if (comPagamento.size) {
    return { ok: false, mensagem: `A comanda ${numeros(linhas.filter((c) => comPagamento.has(c.id)))} já recebeu pagamento e não pode ser juntada.` };
  }
  const deDelivery = new Set(((delivs ?? []) as { comanda_id: string }[]).map((d) => d.comanda_id));
  if (deDelivery.size) {
    return { ok: false, mensagem: `A comanda ${numeros(linhas.filter((c) => deDelivery.has(c.id)))} é de um pedido de delivery e não pode ser juntada.` };
  }

  const comandas = linhas
    .map((c) => ({
      id: c.id, numero: Number(c.numero), mesa: c.mesa, peso: Number(c.peso ?? 0), tara: Number(c.tara ?? 0),
      valor: Number(c.valor_buffet ?? 0), livre: !!c.livre, soKg: !!c.so_kg, clienteId: c.cliente_id,
    }))
    .sort((a, b) => a.numero - b.numero);
  return { ok: true, comandas };
}

/** Comanda com valor e sem peso (botão Livre) não tem o que somar. */
export function podeSomar(comandas: ComandaJuntar[]) {
  return comandas.every((c) => c.peso > 0 || c.valor <= 0.005);
}

/** Como fica o buffet da comanda que sobra em cada escolha. */
export function buffetJuntado(comandas: ComandaJuntar[], modo: ModoJuntar, preco: PrecoBuffet) {
  const principal = comandas[0];
  if (modo.tipo === "livre") {
    if (!(preco.livreHoje > 0)) return { ok: false as const, mensagem: "Preço do buffet livre não está configurado hoje." };
    return {
      ok: true as const,
      campos: { valor_buffet: preco.livreHoje, livre: true, so_kg: false, peso: Math.max(...comandas.map((c) => c.peso)), tara: principal.tara },
    };
  }
  if (modo.tipo === "somar") {
    if (!podeSomar(comandas)) return { ok: false as const, mensagem: "Tem comanda de buffet livre sem peso: escolha Buffet livre ou o valor de uma delas." };
    const peso = redondo(comandas.reduce((s, c) => s + c.peso, 0), 3);
    const { valor, livre } = preco.calcular(peso, principal.soKg);
    return {
      ok: true as const,
      campos: { valor_buffet: valor, livre, so_kg: principal.soKg, peso, tara: redondo(comandas.reduce((s, c) => s + c.tara, 0), 3) },
    };
  }
  const escolhida = comandas.find((c) => c.id === modo.id);
  if (!escolhida) return { ok: false as const, mensagem: "Escolha uma das comandas selecionadas." };
  return {
    ok: true as const,
    campos: { valor_buffet: escolhida.valor, livre: escolhida.livre, so_kg: escolhida.soKg, peso: escolhida.peso, tara: escolhida.tara },
  };
}

/** Faz a junção. `quem` vai no registro de Cancelados. */
export async function aplicarJuntar(db: Db, comandas: ComandaJuntar[], modo: ModoJuntar, preco: PrecoBuffet, quem: string | null) {
  const buffet = buffetJuntado(comandas, modo, preco);
  if (!buffet.ok) return buffet;
  const [principal, ...outras] = comandas;
  const idsOutras = outras.map((c) => c.id);

  const mover = await db.from("pdv_comanda_itens").update({ comanda_id: principal.id }).in("comanda_id", idsOutras);
  if (mover.error) return { ok: false as const, mensagem: "Não consegui mover os itens. Nada foi apagado." };

  const clienteId = principal.clienteId ?? comandas.find((c) => c.clienteId)?.clienteId ?? null;
  const { data: mudou, error: eBuffet } = await db
    .from("pdv_comandas")
    .update({ ...buffet.campos, cliente_id: clienteId })
    .eq("id", principal.id)
    .eq("status", "aberta")
    .eq("buffet_pago", false)
    .select("id");
  if (eBuffet || !mudou?.length) return { ok: false as const, mensagem: `A comanda #${principal.numero} mudou agora há pouco. Atualize a tela e confira.` };

  // Item lançado por um garçom nesse meio-tempo: move de novo e confere antes de
  // apagar, porque apagar a comanda apagaria o item junto.
  await db.from("pdv_comanda_itens").update({ comanda_id: principal.id }).in("comanda_id", idsOutras);
  const { data: sobraram, error: eConf } = await db.from("pdv_comanda_itens").select("id").in("comanda_id", idsOutras);
  if (eConf || sobraram?.length) return { ok: false as const, mensagem: "Ainda há itens nas outras comandas. Nada foi apagado: tente de novo." };

  const { data: apagadas, error: eApagar } = await db
    .from("pdv_comandas")
    .delete()
    .in("id", idsOutras)
    .eq("status", "aberta")
    .eq("buffet_pago", false)
    .select("id");
  if (eApagar) return { ok: false as const, mensagem: "Os itens foram juntados, mas não consegui tirar as outras comandas. Atualize a tela e confira." };

  const saiu = new Set(((apagadas ?? []) as { id: string }[]).map((c) => c.id));
  const registros = outras.filter((c) => saiu.has(c.id)).map((c) => ({
    comanda_numero: c.numero, mesa: c.mesa, valor: c.valor, motivo: `Juntada na comanda #${principal.numero}`, excluido_por: quem,
  }));
  if (registros.length) await db.from("pdv_comandas_excluidas").insert(registros);
  if (saiu.size < outras.length) {
    const faltam = outras.filter((c) => !saiu.has(c.id));
    return { ok: false as const, mensagem: `A comanda ${numeros(faltam)} não foi juntada porque mudou agora há pouco. Atualize a tela e confira.` };
  }
  return { ok: true as const, id: principal.id, numero: principal.numero, valor: buffet.campos.valor_buffet };
}
