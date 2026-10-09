import Link from "next/link";
import { Enviar } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { listarFormas } from "@/lib/formas-pagamento-server";
import { salvarCashback } from "../actions";

export const metadata = { title: "Cashback · Delivery" };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const inputCls = "rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm";

type Config = {
  ativo: boolean; percentual: number; max_resgate: number | null; validade_dias: number;
  canais: string[]; formas_excluidas: string[]; sem_combos: boolean; sem_promos: boolean;
};
type Mov = {
  id: string; tipo: "credito" | "resgate"; valor: number; restante: number | null; expira_em: string | null;
  estornado_em: string | null; criado_em: string; pedido_id: string | null;
  clientes: { nome: string | null } | { nome: string | null }[] | null;
};

// Cashback do delivery (Etapa 6), no formato da tela do Manda Pedido.
export default async function CashbackPage() {
  const supabase = await createClient();
  const agora = new Date().toISOString();
  const [{ data: cfgRow }, { data: movRows }, { data: ativos }, formasDelivery, formasApp] = await Promise.all([
    supabase.from("cashback_config").select("*").maybeSingle(),
    supabase.from("cashback_mov")
      .select("id, tipo, valor, restante, expira_em, estornado_em, criado_em, pedido_id, clientes(nome)")
      .order("criado_em", { ascending: false }).limit(30),
    supabase.from("cashback_mov").select("cliente_id, restante")
      .eq("tipo", "credito").is("estornado_em", null).gt("restante", 0).gt("expira_em", agora),
    listarFormas("delivery"),
    listarFormas("app"),
  ]);
  const c: Config = (cfgRow as Config | null) ?? {
    ativo: false, percentual: 2, max_resgate: 20, validade_dias: 30,
    canais: ["app", "delivery"], formas_excluidas: [], sem_combos: true, sem_promos: true,
  };
  const movs = (movRows as unknown as Mov[]) ?? [];
  const abertos = (ativos as { cliente_id: string; restante: number }[]) ?? [];
  const saldoTotal = abertos.reduce((s, r) => s + Number(r.restante), 0);
  const clientesComSaldo = new Set(abertos.map((r) => r.cliente_id)).size;
  const nomesFormas = [...new Set([...formasDelivery, ...formasApp].map((f) => f.nome).concat(["Pix online"], c.formas_excluidas))];

  const secao = "border-b border-borda py-4";
  const titulo = "text-sm font-semibold text-texto";
  const ajuda = "mb-2 text-xs text-texto-suave";

  return (
    <div className="w-full max-w-3xl p-4">
      <Link href="/delivery" className="text-sm text-emerald-600">← Voltar pro painel</Link>
      <h1 className="mb-1 mt-2 flex items-center gap-2 text-xl font-bold"><Icone nome="presente" tamanho={19} /> Cashback</h1>
      <p className="mb-4 text-sm text-texto-suave">
        O cliente ganha uma parte do pedido de volta como saldo quando o pedido é entregue, e usa esse saldo no próximo pedido pelo app.
        O valor usado entra como desconto no pedido.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-cartao bg-painel-cartao p-3"><div className="text-xs text-texto-suave">Saldo em aberto</div><div className="font-numero text-lg font-semibold">{brl(saldoTotal)}</div></div>
        <div className="rounded-cartao bg-painel-cartao p-3"><div className="text-xs text-texto-suave">Clientes com saldo</div><div className="font-numero text-lg font-semibold">{clientesComSaldo}</div></div>
        <div className="rounded-cartao bg-painel-cartao p-3"><div className="text-xs text-texto-suave">Situação</div><div className={`text-lg font-semibold ${c.ativo ? "text-emerald-600" : "text-texto-suave"}`}>{c.ativo ? "Ligado" : "Desligado"}</div></div>
      </div>

      <form action={salvarCashback} className="rounded-cartao border border-borda px-4">
        <div className={secao}>
          <div className={titulo}>Ativar cashback</div>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="ativo" defaultChecked={c.ativo} className="h-4 w-4" /> Cashback ligado</label>
        </div>

        <div className={secao}>
          <div className={titulo}>Valor de cashback</div>
          <p className={ajuda}>Porcentagem do valor do pedido que o cliente recebe de volta como saldo.</p>
          <label className="flex items-center gap-2 text-sm"><input name="percentual" defaultValue={String(c.percentual).replace(".", ",")} inputMode="decimal" className={`${inputCls} w-24 text-right`} /> %</label>
        </div>

        <div className={secao}>
          <div className={titulo}>Valor máximo de resgate</div>
          <p className={ajuda}>Quanto de cashback o cliente pode usar em um pedido. Em branco = sem limite.</p>
          <label className="flex items-center gap-2 text-sm">R$ <input name="max_resgate" defaultValue={c.max_resgate != null ? String(c.max_resgate).replace(".", ",") : ""} inputMode="decimal" placeholder="sem limite" className={`${inputCls} w-28 text-right`} /></label>
        </div>

        <div className={secao}>
          <div className={titulo}>Validade do saldo</div>
          <p className={ajuda}>Quantos dias depois da entrega o cliente pode usar o saldo ganho.</p>
          <label className="flex items-center gap-2 text-sm"><input name="validade_dias" defaultValue={c.validade_dias} inputMode="numeric" className={`${inputCls} w-24 text-right`} /> dias</label>
        </div>

        <div className={secao}>
          <div className={titulo}>Onde o cliente ganha</div>
          <p className={ajuda}>Pedido feito pelo próprio cliente no cardápio online, ou lançado pelo atendente no painel (telefone, WhatsApp). O saldo é usado no cardápio online.</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="canal_app" defaultChecked={c.canais.includes("app")} className="h-4 w-4" /> Cardápio online</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="canal_delivery" defaultChecked={c.canais.includes("delivery")} className="h-4 w-4" /> Pedido lançado no painel</label>
          </div>
        </div>

        <div className={secao}>
          <div className={titulo}>Formas de pagamento que não dão cashback</div>
          <label className="mb-2 mt-1 flex items-center gap-2 text-sm"><input type="checkbox" name="excluir_formas" defaultChecked={c.formas_excluidas.length > 0} className="h-4 w-4" /> Não dar cashback nestas formas</label>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {nomesFormas.map((f) => (
              <label key={f} className="flex items-center gap-1.5"><input type="checkbox" name="formas_excluidas" value={f} defaultChecked={c.formas_excluidas.includes(f)} className="h-4 w-4" /> {f}</label>
            ))}
          </div>
        </div>

        <div className={secao}>
          <div className={titulo}>Não dar cashback em combos</div>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="sem_combos" defaultChecked={c.sem_combos} className="h-4 w-4" /> Combos ficam de fora da conta</label>
        </div>

        <div className={`${secao} border-b-0`}>
          <div className={titulo}>Não dar cashback em promoções</div>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="sem_promos" defaultChecked={c.sem_promos} className="h-4 w-4" /> Itens com preço promocional ficam de fora da conta</label>
        </div>

        <div className="flex justify-end pb-4">
          <Enviar className="rounded-controle bg-texto px-5 py-2 text-sm font-semibold text-fundo">Salvar</Enviar>
        </div>
      </form>

      <h2 className="mb-2 mt-8 text-sm font-semibold text-texto-suave">Últimos movimentos</h2>
      <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-texto-fraco">
            <tr><th className="px-3 py-2">Quando</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Movimento</th><th className="px-3 py-2 text-right">Valor</th></tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {movs.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-texto-fraco">Nenhum cashback ainda.</td></tr>}
            {movs.map((m) => {
              const cli = Array.isArray(m.clientes) ? m.clientes[0] : m.clientes;
              const desc = m.tipo === "credito"
                ? `Ganhou${m.expira_em ? ` · vale até ${new Date(m.expira_em).toLocaleDateString("pt-BR")}` : ""}${m.estornado_em ? " · desfeito" : ""}`
                : `Usou num pedido${m.estornado_em ? " · devolvido (cancelado)" : ""}`;
              return (
                <tr key={m.id} className={m.estornado_em ? "opacity-50" : ""}>
                  <td className="px-3 py-2 text-texto-suave">{dataHora(m.criado_em)}</td>
                  <td className="px-3 py-2">{cli?.nome ?? "—"}</td>
                  <td className="px-3 py-2 text-texto-suave">
                    {m.pedido_id ? <Link href={`/delivery/${m.pedido_id}`} className="hover:underline">{desc}</Link> : desc}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${m.tipo === "credito" ? "text-emerald-600" : "text-texto"}`}>
                    {m.tipo === "credito" ? "+" : "−"} {brl(Number(m.valor))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
