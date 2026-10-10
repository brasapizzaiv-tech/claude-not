import { createAdminClient } from "@/lib/supabase/admin";
import { criarPedidoDeliveryCore } from "@/lib/delivery-core";

// Pedido de delivery automático do convênio Kern (migration 0219).
//
// Às 08:35 (rotina /api/kern/delivery) junta os pedidos de marmita do dia no
// app do convênio (mkt_pedidos) e cria UM pedido de delivery por filial:
// "N× Marmita kern", agendado pro horário de entrega do convênio (11:00), no
// cliente da filial, forma "Saldo cliente" (ao receber, vira conta a receber
// da Kern). Agendado não imprime na cozinha agora; as etiquetas das marmitas
// continuam saindo pelo app do convênio.
//
// Rodar de novo no mesmo dia não duplica: se entrou pedido depois e o delivery
// ainda não saiu, só atualiza a quantidade.

export type ResultadoKern = { filial: string; qtd: number; acao: "criado" | "atualizado" | "igual" | "travado" | "sem_cliente" | "erro"; detalhe?: string; pedidoId?: string | null };

const STATUS_EDITAVEL = ["pendente", "aceito"];

export async function gerarPedidosKern(empresaId: string, dia: string): Promise<{ ok: boolean; mensagem?: string; filiais: ResultadoKern[] }> {
  const admin = createAdminClient();
  const { data: cfgRow } = await admin.from("kern_delivery_config").select("ativo, item_id, clientes").eq("empresa_id", empresaId).maybeSingle();
  const cfg = cfgRow as { ativo: boolean; item_id: string | null; clientes: Record<string, string> } | null;
  if (!cfg) return { ok: false, mensagem: "Configuração da Kern não encontrada.", filiais: [] };
  if (!cfg.item_id) return { ok: false, mensagem: "Escolha o item cobrado (ex.: Marmita kern).", filiais: [] };

  // Marmitas do dia por filial.
  const { data: peds } = await admin.from("mkt_pedidos").select("filial").eq("empresa_id", empresaId).like("data", `${dia}%`);
  const porFilial = new Map<string, number>();
  for (const p of (peds ?? []) as { filial: string | null }[]) {
    const f = (p.filial || "Sem filial").trim();
    porFilial.set(f, (porFilial.get(f) ?? 0) + 1);
  }
  if (porFilial.size === 0) return { ok: true, mensagem: "Nenhuma marmita pedida pra este dia.", filiais: [] };

  const { data: cfgMkt } = await admin.from("mkt_config").select("chave, valor").eq("empresa_id", empresaId).in("chave", ["horaEntrega", "nomeConvenio"]);
  const kv = new Map(((cfgMkt ?? []) as { chave: string; valor: string }[]).map((r) => [r.chave, r.valor]));
  const horaEntrega = /^\d{2}:\d{2}$/.test(kv.get("horaEntrega") ?? "") ? (kv.get("horaEntrega") as string) : "11:00";
  const convenio = kv.get("nomeConvenio") || "Kern";
  const agendadoPara = new Date(`${dia}T${horaEntrega}:00-03:00`).toISOString();

  const { data: ja } = await admin.from("kern_delivery").select("id, filial, pedido_id, qtd").eq("empresa_id", empresaId).eq("data", dia);
  const jaPor = new Map(((ja ?? []) as { id: string; filial: string; pedido_id: string | null; qtd: number }[]).map((r) => [r.filial, r]));

  const resultado: ResultadoKern[] = [];
  for (const [filial, qtd] of [...porFilial.entries()].sort()) {
    const existente = jaPor.get(filial);
    if (existente?.pedido_id) {
      if (existente.qtd === qtd) { resultado.push({ filial, qtd, acao: "igual", pedidoId: existente.pedido_id }); continue; }
      const { data: ped } = await admin.from("delivery_pedidos").select("status, pago, comanda_id").eq("id", existente.pedido_id).maybeSingle();
      const p = ped as { status: string; pago: boolean; comanda_id: string | null } | null;
      if (!p || p.pago || !STATUS_EDITAVEL.includes(p.status) || !p.comanda_id) {
        resultado.push({ filial, qtd, acao: "travado", detalhe: `pedido já está "${p?.status ?? "?"}"; ficou com ${existente.qtd}`, pedidoId: existente.pedido_id });
        continue;
      }
      await admin.from("pdv_comanda_itens").update({ qtd }).eq("comanda_id", p.comanda_id).eq("item_id", cfg.item_id);
      await admin.from("delivery_pedidos").update({ observacao: obsDoPedido(convenio, filial, qtd) }).eq("id", existente.pedido_id);
      await admin.from("kern_delivery").update({ qtd, atualizado_em: new Date().toISOString() }).eq("id", existente.id);
      resultado.push({ filial, qtd, acao: "atualizado", detalhe: `era ${existente.qtd}`, pedidoId: existente.pedido_id });
      continue;
    }

    const clienteId = cfg.clientes?.[filial];
    if (!clienteId) { resultado.push({ filial, qtd, acao: "sem_cliente", detalhe: "escolha o cliente desta filial em Delivery > Kern" }); continue; }
    const { data: cli } = await admin.from("clientes").select("id, nome, telefone, logradouro, numero, complemento, bairro, municipio, cep").eq("id", clienteId).maybeSingle();
    const c = cli as { id: string; nome: string; telefone: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; municipio: string | null; cep: string | null } | null;
    if (!c) { resultado.push({ filial, qtd, acao: "sem_cliente", detalhe: "o cliente escolhido não existe mais" }); continue; }

    const r = await criarPedidoDeliveryCore(
      admin,
      {
        clienteId: c.id,
        nome: `${convenio} ${filial}`,
        telefone: c.telefone ?? "",
        tipo: "entrega",
        endereco: {
          logradouro: c.logradouro ?? undefined, numero: c.numero ?? undefined, complemento: c.complemento ?? undefined,
          bairro: c.bairro ?? undefined, cidade: c.municipio ?? undefined, cep: c.cep ?? undefined,
          referencia: `${c.nome}`,
        },
        taxaEntrega: 0,
        desconto: 0,
        formaPagamento: "Saldo cliente",
        origem: "convenio",
        observacao: obsDoPedido(convenio, filial, qtd),
        itens: [{ kind: "item", itemId: cfg.item_id, qtd }],
        agendadoPara,
      },
      { status: "aceito", atendenteId: null, criadoPor: null, empresaId },
    );
    if (!r.ok) { resultado.push({ filial, qtd, acao: "erro", detalhe: r.mensagem }); continue; }
    const { error } = await admin.from("kern_delivery").insert({ empresa_id: empresaId, data: dia, filial, pedido_id: r.id, qtd });
    resultado.push({ filial, qtd, acao: error ? "erro" : "criado", detalhe: error?.message, pedidoId: r.id });
  }
  return { ok: true, filiais: resultado };
}

function obsDoPedido(convenio: string, filial: string, qtd: number) {
  return `Convênio ${convenio} · ${filial} · ${qtd} marmita${qtd === 1 ? "" : "s"} (pedidos do app do convênio; etiquetas por lá)`;
}

/** Empresas com o pedido automático ligado (a rotina roda pra cada uma). */
export async function empresasKernAtivas(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("kern_delivery_config").select("empresa_id").eq("ativo", true);
  return ((data ?? []) as { empresa_id: string }[]).map((r) => r.empresa_id);
}
