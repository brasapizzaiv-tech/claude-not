import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AutoRefresh } from "./auto-refresh";

export const metadata = { title: "Seu pedido · Brasa" };
export const dynamic = "force-dynamic";

const LARANJA = "#C78340";
const ESCURO = "#211915";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : null);

export default async function AcompanharPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = createAdminClient();

  const { data: ped } = await admin
    .from("delivery_pedidos")
    .select("nome, tipo, status, taxa_entrega, desconto, criado_em, aceito_em, preparo_em, pronto_em, saiu_em, entregue_em, cancelado_em, previsao_em, comanda_id, forma_pagamento, pdv_comandas(numero)")
    .eq("id", id)
    .maybeSingle();
  if (!ped) notFound();

  const p = ped as Record<string, unknown> & { comanda_id: string | null; pdv_comandas: { numero: number } | { numero: number }[] | null };
  const com = Array.isArray(p.pdv_comandas) ? p.pdv_comandas[0] : p.pdv_comandas;

  const { data: itens } = p.comanda_id
    ? await admin.from("pdv_comanda_itens").select("descricao, qtd, preco_unit").eq("comanda_id", p.comanda_id).order("criado_em")
    : { data: [] };
  const linhas = ((itens ?? []) as { descricao: string; qtd: number; preco_unit: number | null }[]);
  const subtotal = linhas.reduce((s, i) => s + Number(i.qtd) * Number(i.preco_unit || 0), 0);
  const total = Math.round((subtotal + Number(p.taxa_entrega ?? 0) - Number(p.desconto ?? 0)) * 100) / 100;

  const status = p.status as string;
  const retirada = p.tipo === "retirada";
  const ETAPAS = [
    { key: "pendente", label: "Recebido", emoji: "📨", hora: hhmm(p.criado_em as string) },
    { key: "aceito", label: "Confirmado", emoji: "✅", hora: hhmm(p.aceito_em as string | null) },
    { key: "em_preparo", label: "Preparando", emoji: "👨‍🍳", hora: hhmm(p.preparo_em as string | null) },
    { key: "pronto", label: "Pronto", emoji: "🍕", hora: hhmm(p.pronto_em as string | null) },
    ...(retirada
      ? [{ key: "entregue", label: "Retirado", emoji: "🎉", hora: hhmm(p.entregue_em as string | null) }]
      : [
          { key: "saiu", label: "Saiu pra entrega", emoji: "🛵", hora: hhmm(p.saiu_em as string | null) },
          { key: "entregue", label: "Entregue", emoji: "🎉", hora: hhmm(p.entregue_em as string | null) },
        ]),
  ];
  const idx = ETAPAS.findIndex((e) => e.key === status);
  const cancelado = status === "cancelado";
  const msgAtual = cancelado
    ? "Seu pedido foi cancelado. Qualquer dúvida, fale com a gente."
    : status === "pendente" ? "Recebemos seu pedido! O restaurante vai confirmar em instantes."
    : status === "aceito" ? "Pedido confirmado! Já já entra no preparo."
    : status === "em_preparo" ? "Seu pedido está sendo preparado. 🔥"
    : status === "pronto" ? (retirada ? "Pronto! Pode vir retirar. 🏃" : "Pronto! Logo sai pra entrega.")
    : status === "saiu" ? "Saiu pra entrega — chega em breve! 🛵"
    : "Pedido entregue. Bom apetite! 😋";

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <AutoRefresh ativo={!cancelado && status !== "entregue"} />
      <header className="px-4 py-3 text-white" style={{ background: ESCURO }}>
        <div className="mx-auto max-w-lg">
          <div className="text-lg font-bold" style={{ color: LARANJA }}>Brasa Pizzaria e Restaurante</div>
          <div className="text-xs text-zinc-300">Acompanhamento do pedido</div>
        </div>
      </header>

      <main className="mx-auto max-w-lg p-4">
        <div className="mb-1 text-sm text-zinc-500">Pedido {com?.numero ? `nº ${com.numero}` : ""} · {p.nome as string}</div>
        <div className={`mb-5 rounded-2xl px-4 py-3 font-semibold ${cancelado ? "bg-rose-500/10 text-rose-600" : "text-white"}`} style={cancelado ? {} : { background: LARANJA }}>
          {msgAtual}
        </div>

        {!cancelado && (
          <div className="mb-6 space-y-0">
            {ETAPAS.map((e, i) => {
              const feito = i <= idx;
              const atual = i === idx;
              return (
                <div key={e.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-base ${feito ? "text-white" : "bg-zinc-100 dark:bg-zinc-800"}`} style={feito ? { background: LARANJA } : {}}>{e.emoji}</div>
                    {i < ETAPAS.length - 1 && <div className="h-6 w-0.5" style={{ background: i < idx ? LARANJA : "rgb(212 212 216 / 0.5)" }} />}
                  </div>
                  <div className="pb-2">
                    <div className={`font-semibold ${atual ? "" : feito ? "" : "text-zinc-400"}`} style={atual ? { color: LARANJA } : {}}>{e.label}</div>
                    {e.hora && <div className="text-xs text-zinc-400">{e.hora}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <h2 className="mb-2 font-bold">Resumo</h2>
        <div className="space-y-1.5 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
          {linhas.map((i, k) => (
            <div key={k} className="flex justify-between gap-2 text-sm">
              <span className="whitespace-pre-line"><b>{Number(i.qtd)}x</b> {i.descricao}</span>
              <span className="shrink-0">{brl(Number(i.qtd) * Number(i.preco_unit || 0))}</span>
            </div>
          ))}
          <div className="mt-2 space-y-1 border-t border-zinc-200 pt-2 text-sm dark:border-zinc-800">
            {!retirada && <div className="flex justify-between text-zinc-500"><span>Entrega</span><span>{brl(Number(p.taxa_entrega ?? 0))}</span></div>}
            <div className="flex justify-between text-base font-bold"><span>Total</span><span>{brl(total)}</span></div>
            <div className="text-xs text-zinc-400">Pagamento na {retirada ? "retirada" : "entrega"}: {(p.forma_pagamento as string) ?? "—"}</div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400">Esta página atualiza sozinha. 🔄</p>
      </main>
    </div>
  );
}
