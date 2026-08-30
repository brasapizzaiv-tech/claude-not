"use server";

// Ações públicas do app do cliente (/pedir). Sem login: usa o admin client no
// servidor (padrão dos apps por token). TODO preço/taxa é recalculado aqui —
// nada do que vem do navegador é confiado.
import { createAdminClient } from "@/lib/supabase/admin";
import { calcularTaxaEntrega, criarPedidoDeliveryCore, type LinhaPedido } from "@/lib/delivery-core";

export type { LinhaPedido } from "@/lib/delivery-core";

// Taxa de entrega ao digitar o endereço (exibição pro cliente).
export async function calcularEntregaPublico(endereco: {
  logradouro?: string; numero?: string; bairro?: string; cidade?: string; cep?: string;
}) {
  const admin = createAdminClient();
  return calcularTaxaEntrega(admin, endereco);
}

export async function enviarPedidoPublico(d: {
  nome: string;
  telefone: string;
  tipo: "entrega" | "retirada";
  endereco?: { logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; referencia?: string; cep?: string };
  formaPagamento: string;
  trocoPara?: number | null;
  observacao?: string;
  itens: LinhaPedido[];
}) {
  const admin = createAdminClient();

  // Validações básicas.
  const nome = (d.nome || "").trim();
  const fone = (d.telefone || "").replace(/\D/g, "");
  if (nome.length < 2) return { ok: false as const, mensagem: "Informe seu nome." };
  if (fone.length < 10) return { ok: false as const, mensagem: "Informe um telefone com DDD (ex.: 51 99999-9999)." };
  if (!Array.isArray(d.itens) || d.itens.length === 0) return { ok: false as const, mensagem: "Seu carrinho está vazio." };
  if (d.itens.length > 60) return { ok: false as const, mensagem: "Pedido muito grande — fale com a gente no WhatsApp." };

  // Delivery precisa estar aberto.
  const { data: cfg } = await admin.from("delivery_config").select("aberto").eq("id", 1).maybeSingle();
  if (cfg && cfg.aberto === false) return { ok: false as const, mensagem: "O delivery está fechado agora. Tente mais tarde!" };

  // Entrega: recalcula a taxa AQUI (autoritativo) e valida o endereço.
  let taxa = 0;
  let distancia: number | null = null;
  let lat: number | null = null, lng: number | null = null;
  if (d.tipo === "entrega") {
    if (!(d.endereco?.logradouro || "").trim()) return { ok: false as const, mensagem: "Informe o endereço de entrega." };
    const calc = await calcularTaxaEntrega(admin, d.endereco ?? {});
    if (!calc.ok) return { ok: false as const, mensagem: calc.mensagem };
    if (calc.foraDeArea) return { ok: false as const, mensagem: "Esse endereço fica fora da nossa área de entrega. 😕" };
    taxa = calc.taxa; distancia = calc.distanciaKm; lat = calc.lat; lng = calc.lng;
  }

  // Reconhece (ou cadastra) o cliente pelo telefone.
  let clienteId: string | null = null;
  const { data: cli } = await admin
    .from("clientes").select("id").ilike("telefone", `%${fone}%`).limit(1).maybeSingle();
  if (cli?.id) {
    clienteId = cli.id as string;
  } else {
    const { data: novo } = await admin
      .from("clientes")
      .insert({
        nome,
        telefone: fone,
        logradouro: d.endereco?.logradouro ?? null,
        numero: d.endereco?.numero ?? null,
        complemento: d.endereco?.complemento ?? null,
        bairro: d.endereco?.bairro ?? null,
        municipio: d.endereco?.cidade ?? null,
        cep: d.endereco?.cep ?? null,
      })
      .select("id")
      .single();
    clienteId = (novo?.id as string) ?? null;
  }

  const r = await criarPedidoDeliveryCore(
    admin,
    {
      clienteId,
      nome,
      telefone: fone,
      tipo: d.tipo,
      endereco: d.tipo === "entrega" ? d.endereco : undefined,
      distanciaKm: distancia,
      lat, lng,
      taxaEntrega: taxa,
      desconto: 0,
      formaPagamento: d.formaPagamento,
      trocoPara: d.trocoPara ?? null,
      origem: "app",
      observacao: d.observacao,
      itens: d.itens,
    },
    { status: "pendente", atendenteId: null, criadoPor: null },
  );
  if (!r.ok) return r;
  return { ok: true as const, id: r.id, numero: r.numero, taxa };
}
