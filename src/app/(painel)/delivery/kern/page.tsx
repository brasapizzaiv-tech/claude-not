import Link from "next/link";
import { Enviar } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { salvarKernDelivery } from "./actions";
import { GerarAgora } from "./gerar";

export const metadata = { title: "Kern · Delivery" };
export const dynamic = "force-dynamic";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ST: Record<string, string> = { pendente: "Pendente", aceito: "Aceito", em_preparo: "Em preparo", pronto: "Pronto", saiu: "Saiu", entregue: "Entregue", cancelado: "Cancelado" };
const CAMPO = "min-h-11 w-full rounded-controle border border-borda-forte bg-transparent px-3 text-sm";

function diasAtras(dia: string, n: number) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}

// Pedido de delivery automático do convênio Kern (migration 0219,
// src/lib/kern-delivery.ts). Às 08:35, de segunda a sábado, vira um pedido por
// filial com as marmitas pedidas no app do convênio.
export default async function KernDeliveryPage() {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const [{ data: cfgRow }, { data: itens }, { data: clientes }, { data: mkt }, { data: pedHoje }, { data: hist }] = await Promise.all([
    supabase.from("kern_delivery_config").select("ativo, item_id, clientes").maybeSingle(),
    supabase.from("pdv_itens").select("id, nome, preco").eq("ativo", true).ilike("nome", "%marmit%").order("nome"),
    supabase.from("clientes").select("id, nome, bairro, logradouro").ilike("nome", "%kern%").order("nome"),
    supabase.from("mkt_config").select("chave, valor").in("chave", ["filiais", "horaEntrega", "horaLimite"]),
    supabase.from("mkt_pedidos").select("filial").like("data", `${hoje}%`),
    supabase.from("kern_delivery").select("data, filial, qtd, pedido_id, atualizado_em, delivery_pedidos(status, pago)").gte("data", diasAtras(hoje, 14)).order("data", { ascending: false }).order("filial"),
  ]);
  const cfg = (cfgRow as { ativo: boolean; item_id: string | null; clientes: Record<string, string> } | null) ?? { ativo: false, item_id: null, clientes: {} };
  const kv = new Map(((mkt ?? []) as { chave: string; valor: string }[]).map((r) => [r.chave, r.valor]));
  let filiais: string[] = [];
  try { filiais = JSON.parse(kv.get("filiais") ?? "[]"); } catch { filiais = []; }
  const horaEntrega = kv.get("horaEntrega") || "11:00";
  const horaLimite = kv.get("horaLimite") || "08:30";
  const contHoje = new Map<string, number>();
  for (const p of (pedHoje ?? []) as { filial: string | null }[]) contHoje.set(p.filial ?? "", (contHoje.get(p.filial ?? "") ?? 0) + 1);
  const listaItens = (itens ?? []) as { id: string; nome: string; preco: number }[];
  const item = listaItens.find((i) => i.id === cfg.item_id);
  type Hist = { data: string; filial: string; qtd: number; pedido_id: string | null; atualizado_em: string | null; delivery_pedidos: { status: string; pago: boolean } | { status: string; pago: boolean }[] | null };
  const historico = (hist ?? []) as Hist[];

  return (
    <div className="w-full max-w-4xl p-4">
      <Link href="/delivery" className="text-sm text-emerald-600">← Voltar pro painel</Link>
      <h1 className="mt-2 flex items-center gap-2 text-xl font-bold"><Icone nome="empresa" tamanho={19} /> Pedido automático da Kern</h1>
      <p className="mb-5 max-w-2xl text-sm text-texto-suave">
        De segunda a sábado, às 08:35, o sistema junta as marmitas pedidas no app do convênio (que fecha às {horaLimite}) e cria um pedido de delivery por filial,
        agendado pras {horaEntrega}. O pedido vai como &quot;Saldo cliente&quot;: ao receber, vira conta a receber da Kern. As etiquetas continuam saindo pelo app do convênio.
      </p>

      <form action={salvarKernDelivery} className="mb-6 flex flex-col gap-4 rounded-cartao bg-painel-cartao p-4">
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" name="ativo" defaultChecked={cfg.ativo} className="h-5 w-5 accent-emerald-600" />
          Criar os pedidos sozinho às 08:35
        </label>
        <div className="max-w-sm">
          <label className="mb-1 block text-xs text-texto-suave" htmlFor="item_id">Item cobrado por marmita</label>
          <select id="item_id" name="item_id" defaultValue={cfg.item_id ?? ""} className={CAMPO}>
            <option value="">— escolher —</option>
            {listaItens.map((i) => <option key={i.id} value={i.id}>{i.nome} · {brl(Number(i.preco))}</option>)}
          </select>
        </div>
        <div>
          <p className="mb-2 text-xs text-texto-suave">Cliente de cada filial (o endereço do pedido vem do cadastro dele)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {filiais.map((f) => (
              <div key={f}>
                <label className="mb-1 block text-sm font-medium" htmlFor={`cli-${f}`}>{f}</label>
                <select id={`cli-${f}`} name={`cliente:${f}`} defaultValue={cfg.clientes?.[f] ?? ""} className={CAMPO}>
                  <option value="">— sem cliente (não cria pedido) —</option>
                  {((clientes ?? []) as { id: string; nome: string; bairro: string | null; logradouro: string | null }[]).map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}{c.bairro ? ` · ${c.bairro}` : ""}{c.logradouro ? "" : " · sem rua"}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-texto-fraco">Os clientes da Kern estão sem rua e número no cadastro. Completando em Clientes, o entregador recebe o endereço inteiro.</p>
        </div>
        <Enviar className="min-h-11 self-start rounded-controle bg-texto px-5 text-sm font-semibold text-fundo">Salvar</Enviar>
      </form>

      <section className="mb-6 rounded-cartao border border-borda p-4">
        <h2 className="mb-2 font-semibold">Hoje</h2>
        <p className="mb-3 text-sm text-texto-suave">
          Marmitas pedidas até agora: {filiais.map((f) => `${f} ${contHoje.get(f) ?? 0}`).join(" · ")}
          {item ? ` · cobrado ${brl(Number(item.preco))} cada` : ""}
        </p>
        <GerarAgora />
        <p className="mt-2 text-xs text-texto-fraco">Se entrar pedido depois das 08:35, este botão atualiza a quantidade, desde que o delivery ainda não tenha saído.</p>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Últimos 15 dias</h2>
        <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-texto-fraco"><tr><th className="px-3 py-2">Dia</th><th className="px-3 py-2">Filial</th><th className="px-3 py-2 text-right">Marmitas</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Pedido</th></tr></thead>
            <tbody className="divide-y divide-borda">
              {historico.map((h) => {
                const p = Array.isArray(h.delivery_pedidos) ? h.delivery_pedidos[0] : h.delivery_pedidos;
                return (
                  <tr key={`${h.data}|${h.filial}`}>
                    <td className="px-3 py-2">{h.data.slice(8, 10)}/{h.data.slice(5, 7)}</td>
                    <td className="px-3 py-2">{h.filial}</td>
                    <td className="px-3 py-2 text-right">{h.qtd}{h.atualizado_em ? " (atualizado)" : ""}</td>
                    <td className="px-3 py-2 text-right">{item ? brl(h.qtd * Number(item.preco)) : "—"}</td>
                    <td className="px-3 py-2">{h.pedido_id ? <Link href={`/delivery/${h.pedido_id}`} className="hover:underline">{p ? `${ST[p.status] ?? p.status}${p.pago ? " · recebido" : ""}` : "abrir"}</Link> : "—"}</td>
                  </tr>
                );
              })}
              {historico.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-texto-fraco">Nenhum pedido gerado ainda. O primeiro sai na próxima manhã de entrega, às 08:35.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
