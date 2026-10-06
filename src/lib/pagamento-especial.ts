// As duas formas de pagamento que NÃO são dinheiro entrando: "Compra da
// equipe" (vai pra conta do funcionário em Compras internas, /retiradas) e
// "Saldo cliente" (fiado: vai pra conta do cliente, cliente_fiado, respeitando
// o limite de crédito). O caixa do salão sempre fez isso; desde 06/10/2026 o
// PDV e o recebimento do delivery usam o mesmo código — o Rafael pediu pra um
// funcionário poder pedir pelo app e o operador mudar pra Compra da equipe.
import type { createClient } from "@/lib/supabase/server";
import { tipoDe, type FormaOpcao } from "./formas-pagamento";

type Db = Awaited<ReturnType<typeof createClient>>;

export type PagamentoEspecial = {
  forma: string;
  valor: number;
  observacao?: string | null;
  colaboradorId?: string | null;
};

export async function lancarFormasEspeciais(
  supabase: Db,
  opts: {
    pagamentos: PagamentoEspecial[];
    clienteId?: string | null;
    /** Como a venda aparece no extrato: "comandas #12, #13", "PDV Balcão #5", "delivery #40 · Maria". */
    rotulo: string;
    comandaId?: string | null;
    caixaId?: string | null;
    formas?: FormaOpcao[];
  },
): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  const tipo = (f: string) => tipoDe(f, opts.formas);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  // "Compra da equipe": o consumo do funcionário vai pra conta dele em
  // Compras internas, pra descontar depois — igual ao que o caixa lançaria à
  // mão, só que já ligado à venda.
  const daEquipe = opts.pagamentos.filter((p) => tipo(p.forma) === "equipe" && p.valor > 0);
  if (daEquipe.length > 0) {
    if (daEquipe.some((p) => !p.colaboradorId)) {
      return { ok: false, mensagem: "Escolha o funcionário pra lançar a compra da equipe." };
    }
    const { data: userEq } = await supabase.auth.getUser();
    const hojeBR = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    for (const p of daEquipe) {
      const { data: colab } = await supabase.from("colaboradores").select("nome, ativo").eq("id", p.colaboradorId!).maybeSingle();
      if (!colab || !colab.ativo) return { ok: false, mensagem: "Funcionário não encontrado (ou desligado)." };
      const { error } = await supabase.from("retiradas").insert({
        colaborador_id: p.colaboradorId,
        nome: colab.nome as string,
        item: `Consumo · ${opts.rotulo}`,
        valor: r2(p.valor),
        data: hojeBR,
        status: "aberto",
        observacao: (p.observacao || "").trim().slice(0, 200) || null,
        criado_por: userEq.user?.id ?? null,
      });
      if (error) return { ok: false, mensagem: `Não lançou a compra da equipe: ${error.message}` };
    }
  }

  // "Saldo cliente" (fiado): a parte paga assim vai pra conta do cliente.
  const fiado = r2(opts.pagamentos.filter((p) => tipo(p.forma) === "saldo" && p.valor > 0).reduce((a, p) => a + p.valor, 0));
  if (fiado > 0) {
    const clienteId = opts.clienteId ?? null;
    if (!clienteId) return { ok: false, mensagem: "Pra receber como Saldo cliente, vincule o cliente antes." };
    // Limite de crédito do cliente (vazio = sem limite).
    const { data: cliLim } = await supabase.from("clientes").select("nome, limite_credito").eq("id", clienteId).maybeSingle();
    const limite = cliLim?.limite_credito == null ? null : Number(cliLim.limite_credito);
    if (limite != null && limite >= 0) {
      const { data: mov } = await supabase.from("cliente_fiado").select("tipo, valor").eq("cliente_id", clienteId);
      const saldo = ((mov as { tipo: string; valor: number }[]) ?? []).reduce(
        (a, r) => a + (r.tipo === "debito" ? Number(r.valor) : -Number(r.valor)), 0);
      const novo = r2(saldo + fiado);
      if (novo > limite + 0.005) {
        const brlS = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        return {
          ok: false,
          mensagem: `${cliLim?.nome ?? "O cliente"} passaria do limite de crédito: já deve ${brlS(saldo)}, o limite é ${brlS(limite)} e esta conta levaria a ${brlS(novo)}. Receba de outra forma ou aumente o limite no cadastro do cliente.`,
        };
      }
    }
    const { data: userData } = await supabase.auth.getUser();
    const rotulo = opts.rotulo.charAt(0).toUpperCase() + opts.rotulo.slice(1);
    const { error } = await supabase.from("cliente_fiado").insert({
      cliente_id: clienteId,
      tipo: "debito",
      valor: fiado,
      descricao: rotulo,
      comanda_id: opts.comandaId ?? null,
      caixa_id: opts.caixaId ?? null,
      criado_por: userData.user?.id ?? null,
    });
    if (error) return { ok: false, mensagem: `Não lançou no saldo do cliente: ${error.message}` };
  }

  return { ok: true };
}
