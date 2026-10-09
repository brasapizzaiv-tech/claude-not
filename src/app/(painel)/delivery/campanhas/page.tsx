import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { PUBLICOS, STATUS_CAMPANHA } from "@/lib/whatsapp-catalogo";

export const metadata = { title: "Campanhas · Delivery" };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });


function inicioPeriodo(p: string) {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  if (p === "30") return new Date(Date.now() - 30 * 86400000).toISOString();
  if (p === "tudo") return "2000-01-01T00:00:00Z";
  return new Date(`${hoje.slice(0, 7)}-01T00:00:00-03:00`).toISOString(); // mês atual
}

export default async function CampanhasPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo = "mes" } = await searchParams;
  const desde = inicioPeriodo(periodo);
  const supabase = await createClient();

  const [{ data: campRows }, { count: enviadas }, { data: pedRows }] = await Promise.all([
    supabase.from("wpp_campanhas").select("id, nome, status, publico, criado_em, total_clientes").order("criado_em", { ascending: false }).limit(100),
    supabase.from("wpp_envios").select("id", { count: "exact", head: true }).not("campanha_id", "is", null).in("status", ["enviada", "entregue", "lida"]).gte("enviado_em", desde),
    supabase.from("delivery_pedidos").select("id, campanha_id, comanda_id, tipo, taxa_entrega, desconto").not("campanha_id", "is", null).eq("status", "entregue").gte("entregue_em", desde),
  ]);
  type Camp = { id: string; nome: string; status: string; publico: { tipo?: string }; criado_em: string; total_clientes: number | null };
  const campanhas = (campRows as Camp[]) ?? [];
  const pedidos = (pedRows as { id: string; campanha_id: string; comanda_id: string | null; tipo: string; taxa_entrega: number; desconto: number }[]) ?? [];

  // Total vendido = itens + entrega − desconto, dos pedidos que vieram das campanhas.
  const comandas = pedidos.map((p) => p.comanda_id).filter(Boolean) as string[];
  const somaComanda = new Map<string, number>();
  if (comandas.length) {
    const { data: itens } = await supabase.from("pdv_comanda_itens").select("comanda_id, qtd, preco_unit").in("comanda_id", comandas);
    for (const i of (itens ?? []) as { comanda_id: string; qtd: number; preco_unit: number | null }[]) {
      somaComanda.set(i.comanda_id, (somaComanda.get(i.comanda_id) ?? 0) + Number(i.qtd) * Number(i.preco_unit || 0));
    }
  }
  const totalVendido = pedidos.reduce((s, p) => s + (somaComanda.get(p.comanda_id ?? "") ?? 0) + (p.tipo === "retirada" ? 0 : Number(p.taxa_entrega || 0)) - Number(p.desconto || 0), 0);
  const nCampanhas = campanhas.filter((c) => c.criado_em >= desde).length;

  // Enviadas por campanha (pra coluna da lista).
  const ids = campanhas.map((c) => c.id);
  const enviadasDe = new Map<string, number>();
  if (ids.length) {
    const { data: env } = await supabase.from("wpp_envios").select("campanha_id").in("campanha_id", ids).in("status", ["enviada", "entregue", "lida"]);
    for (const e of (env ?? []) as { campanha_id: string }[]) enviadasDe.set(e.campanha_id, (enviadasDe.get(e.campanha_id) ?? 0) + 1);
  }

  const cartao = "rounded-cartao bg-painel-cartao p-3 text-center";
  return (
    <div className="w-full p-4">
      <Link href="/delivery" className="text-sm text-emerald-600">← Voltar pro painel</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Icone nome="megafone" tamanho={19} /> Campanhas</h1>
          <p className="text-sm text-texto-suave">Mensagens pelo WhatsApp oficial pra grupos de clientes. Saem em lotes, no horário que você marcar.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2 text-sm">
          <Link href="/delivery/gatilhos" className="inline-flex items-center gap-1.5 rounded-controle border border-borda-forte px-3 py-2"><Icone nome="rapido" tamanho={14} /> Gatilhos automáticos</Link>
          <Link href="/delivery/whatsapp" className="inline-flex items-center gap-1.5 rounded-controle border border-borda-forte px-3 py-2"><Icone nome="ajustes" tamanho={14} /> Modelos e limites</Link>
          <Link href="/delivery/campanhas/nova" className="rounded-controle bg-texto px-4 py-2 font-semibold text-fundo">+ Campanha</Link>
        </div>
      </div>

      <div className="mb-3 flex gap-2 text-sm">
        {[["mes", "Mês atual"], ["30", "Últimos 30 dias"], ["tudo", "Tudo"]].map(([v, r]) => (
          <Link key={v} href={`/delivery/campanhas?periodo=${v}`} className={`rounded-full border px-3 py-1 ${periodo === v ? "border-texto bg-texto text-fundo" : "border-borda-forte text-texto-suave"}`}>{r}</Link>
        ))}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={cartao}><div className="text-xs text-texto-suave">Campanhas</div><div className="font-numero text-xl font-semibold">{nCampanhas}</div></div>
        <div className={cartao}><div className="text-xs text-texto-suave">Mensagens enviadas</div><div className="font-numero text-xl font-semibold">{enviadas ?? 0}</div></div>
        <div className={cartao}><div className="text-xs text-texto-suave">Vendas</div><div className="font-numero text-xl font-semibold">{pedidos.length}</div></div>
        <div className={cartao}><div className="text-xs text-texto-suave">Total vendido</div><div className="font-numero text-xl font-semibold">{brl(totalVendido)}</div></div>
      </div>

      <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-texto-fraco">
            <tr><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Público</th><th className="px-3 py-2">Criação</th><th className="px-3 py-2 text-right">Clientes</th><th className="px-3 py-2 text-right">Enviadas</th></tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {campanhas.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-texto-fraco">Nenhuma campanha ainda. Comece criando um modelo de mensagem em Modelos e limites.</td></tr>
            )}
            {campanhas.map((c) => {
              const st = STATUS_CAMPANHA[c.status] ?? { rotulo: c.status, cor: "" };
              return (
                <tr key={c.id}>
                  <td className={`px-3 py-2 font-medium ${st.cor}`}>{st.rotulo}</td>
                  <td className="px-3 py-2"><Link href={`/delivery/campanhas/${c.id}`} className="font-medium hover:underline">{c.nome}</Link></td>
                  <td className="px-3 py-2 text-texto-suave">{PUBLICOS[(c.publico?.tipo ?? "todos") as keyof typeof PUBLICOS] ?? "—"}</td>
                  <td className="px-3 py-2 text-texto-suave">{dataBR(c.criado_em)}</td>
                  <td className="px-3 py-2 text-right">{c.total_clientes ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{enviadasDe.get(c.id) ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
