// Painel do DELIVERY na TV da cozinha (pedido do Rafael, 27/11/2026, olhando a
// TV da Beeis): contador do turno (marmitas no almoço, pizzas à noite) com a
// meta, entrega × retirada, quantos em produção, maior tempo na cozinha,
// motoboys na rua, maior espera por motoboy e os ATRASADOS em destaque.
// Convênio (Kern) fica fora: é produção à parte, sai por etiqueta.
import { createAdminClient } from "@/lib/supabase/admin";

export type PedidoTv = { numero: number | null; nome: string; itens: string; min: number; hora?: string; retirada?: boolean };
export type DeliveryTv = {
  ativo: boolean;
  turno: "almoco" | "noite";
  rotulo: string;           // "marmitas" | "pizzas"
  contador: number;
  meta: number | null;
  entrega: number;
  retirada: number;
  emProducao: number;
  maiorCozinha: PedidoTv | null;
  motoboysNaRua: number;
  pedidosNaRua: number;
  esperaMotoboy: PedidoTv | null;
  atrasados: PedidoTv[];
  proximos: PedidoTv[];   // ainda no prazo, na ordem de saída
};

const SP_MS = 3 * 3600 * 1000;
const ANTECEDENCIA_SAIDA_MIN = 10; // a entrega tem que sair ~10 min antes do horário

type Ped = {
  id: string; numero_turno: number | null; nome: string; tipo: string; status: string;
  agendado_para: string | null; previsao_em: string | null; preparo_em: string | null; pronto_em: string | null;
  entregador_id: string | null; comanda_id: string | null;
};

const contarMarmitas = (nome: string) => (/duas\s+marmitas/i.test(nome) ? 2 : (nome.match(/marmita/gi) ?? []).length);

export async function deliveryTv(empresaId?: string | null, agora = Date.now()): Promise<DeliveryTv> {
  const admin = createAdminClient();
  const local = new Date(agora - SP_MS);
  const hoje = local.toISOString().slice(0, 10);
  const turno: "almoco" | "noite" = local.getUTCHours() < 16 ? "almoco" : "noite";

  let qc = admin.from("delivery_config").select("config").limit(1);
  if (empresaId) qc = qc.eq("empresa_id", empresaId);
  const { data: cfg } = await qc.maybeSingle();
  const metas = ((cfg as { config?: { metaTv?: { almoco?: unknown; noite?: unknown } } | null } | null)?.config?.metaTv) ?? {};
  const metaN = Number(turno === "almoco" ? metas.almoco : metas.noite);

  let q = admin
    .from("delivery_pedidos")
    .select("id, numero_turno, nome, tipo, status, agendado_para, previsao_em, preparo_em, pronto_em, entregador_id, comanda_id")
    .eq("turno_data", hoje)
    .ilike("turno", turno === "almoco" ? "almo%" : "noite%")
    .neq("status", "cancelado")
    .neq("origem", "convenio")
    .limit(400);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data } = await q;
  const peds = (data as Ped[] | null) ?? [];

  // Itens (pra contar e pra mostrar no atrasado).
  const comandas = peds.map((p) => p.comanda_id).filter(Boolean) as string[];
  const itensDe = new Map<string, { nome: string; qtd: number; pizza: boolean }[]>();
  if (comandas.length) {
    const { data: its } = await admin.from("pdv_comanda_itens").select("comanda_id, descricao, qtd, item_id").in("comanda_id", comandas).limit(2000);
    for (const i of (its as { comanda_id: string; descricao: string; qtd: number; item_id: string | null }[] | null) ?? []) {
      const l = itensDe.get(i.comanda_id) ?? [];
      l.push({ nome: String(i.descricao || "").split("\n")[0].trim(), qtd: Number(i.qtd) || 0, pizza: i.item_id === null });
      itensDe.set(i.comanda_id, l);
    }
  }
  let contador = 0;
  for (const p of peds) {
    for (const i of itensDe.get(p.comanda_id ?? "") ?? []) {
      contador += turno === "almoco" ? contarMarmitas(i.nome) * i.qtd : i.pizza ? i.qtd : 0;
    }
  }
  const resumoItens = (p: Ped) => {
    const l = itensDe.get(p.comanda_id ?? "") ?? [];
    const principais = l.filter((i) => (turno === "almoco" ? contarMarmitas(i.nome) > 0 : i.pizza));
    return (principais.length ? principais : l).map((i) => `${Number.isInteger(i.qtd) && i.qtd > 1 ? `${i.qtd}× ` : ""}${i.nome}`).join(", ");
  };
  const minDesde = (iso: string) => Math.max(0, Math.floor((agora - Date.parse(iso)) / 60000));
  const tv = (p: Ped, min: number): PedidoTv => ({ numero: p.numero_turno, nome: p.nome, itens: resumoItens(p), min });

  const emPreparo = peds.filter((p) => p.status === "em_preparo");
  const maior = emPreparo.filter((p) => p.preparo_em).sort((a, b) => Date.parse(a.preparo_em!) - Date.parse(b.preparo_em!))[0];
  const prontos = peds.filter((p) => p.status === "pronto" && p.tipo === "entrega" && p.pronto_em).sort((a, b) => Date.parse(a.pronto_em!) - Date.parse(b.pronto_em!));
  const naRua = peds.filter((p) => p.status === "saiu");

  const atrasados: PedidoTv[] = [];
  const proximos: (PedidoTv & { t: number })[] = [];
  const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  for (const p of peds) {
    if (!["aceito", "em_preparo", "pronto"].includes(p.status)) continue;
    if (p.tipo === "retirada" && p.status === "pronto") continue; // pronto no balcão: é com o cliente
    const alvo = p.agendado_para ?? p.previsao_em;
    if (!alvo) continue;
    const limite = Date.parse(alvo) - (p.tipo === "entrega" ? ANTECEDENCIA_SAIDA_MIN * 60000 : 0);
    if (agora > limite) atrasados.push(tv(p, Math.floor((agora - limite) / 60000)));
    else proximos.push({ ...tv(p, 0), hora: hhmm(limite), retirada: p.tipo === "retirada", t: limite });
  }
  proximos.sort((a, b) => a.t - b.t);
  atrasados.sort((a, b) => b.min - a.min);

  return {
    ativo: peds.length > 0,
    turno,
    rotulo: turno === "almoco" ? "marmitas" : "pizzas",
    contador,
    meta: Number.isFinite(metaN) && metaN > 0 ? Math.round(metaN) : null,
    entrega: peds.filter((p) => p.tipo === "entrega").length,
    retirada: peds.filter((p) => p.tipo === "retirada").length,
    emProducao: emPreparo.length,
    maiorCozinha: maior ? tv(maior, minDesde(maior.preparo_em!)) : null,
    motoboysNaRua: new Set(naRua.map((p) => p.entregador_id ?? `sem:${p.id}`)).size,
    pedidosNaRua: naRua.length,
    esperaMotoboy: prontos[0] ? tv(prontos[0], minDesde(prontos[0].pronto_em!)) : null,
    atrasados,
    proximos: proximos.slice(0, 8).map((p) => ({ numero: p.numero, nome: p.nome, itens: p.itens, min: p.min, hora: p.hora, retirada: p.retirada })),
  };
}
