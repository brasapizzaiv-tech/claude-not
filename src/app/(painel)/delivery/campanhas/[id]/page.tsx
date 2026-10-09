import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { PUBLICOS, STATUS_CAMPANHA, VARIAVEIS, type Variavel } from "@/lib/whatsapp-catalogo";
import { AcoesCampanha } from "./acoes";

export const metadata = { title: "Campanha · Delivery" };
export const dynamic = "force-dynamic";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const NOME_DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ROTULO_ENVIO: Record<string, string> = { fila: "Na fila", enviada: "Enviada", entregue: "Entregue", lida: "Lida", falha: "Falhou", pulada: "Não enviada" };

export default async function CampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: c } = await supabase.from("wpp_campanhas").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const camp = c as {
    id: string; nome: string; status: string; publico: { tipo?: string; dias?: number | null; min?: number | null };
    dias: number[]; hora_ini: string; hora_fim: string; cupom: string | null; modelo: string; variaveis: string[];
    imagem_url: string | null; total_clientes: number | null; criado_em: string; lancada_em: string | null; concluida_em: string | null;
  };

  // Contagem por situação: uma consulta "head" por status (a campanha pode ter milhares de linhas).
  const STATUS = ["fila", "enviada", "entregue", "lida", "falha", "pulada"] as const;
  const contagens = await Promise.all(STATUS.map((s) =>
    supabase.from("wpp_envios").select("id", { count: "exact", head: true }).eq("campanha_id", id).eq("status", s).then((r) => r.count ?? 0)));
  const n = Object.fromEntries(STATUS.map((s, i) => [s, contagens[i]])) as Record<(typeof STATUS)[number], number>;
  const saiu = n.enviada + n.entregue + n.lida;

  const [{ data: pedRows }, { data: recentes }, { data: falhas }] = await Promise.all([
    supabase.from("delivery_pedidos").select("id, comanda_id, tipo, taxa_entrega, desconto, status").eq("campanha_id", id),
    supabase.from("wpp_envios").select("id, nome, telefone, status, enviado_em, erro").eq("campanha_id", id).neq("status", "fila").order("enviado_em", { ascending: false, nullsFirst: false }).limit(30),
    supabase.from("wpp_envios").select("erro").eq("campanha_id", id).eq("status", "falha").limit(500),
  ]);
  const pedidos = ((pedRows ?? []) as { id: string; comanda_id: string | null; tipo: string; taxa_entrega: number; desconto: number; status: string }[]).filter((p) => p.status === "entregue");
  const comandas = pedidos.map((p) => p.comanda_id).filter(Boolean) as string[];
  const soma = new Map<string, number>();
  if (comandas.length) {
    const { data: itens } = await supabase.from("pdv_comanda_itens").select("comanda_id, qtd, preco_unit").in("comanda_id", comandas);
    for (const i of (itens ?? []) as { comanda_id: string; qtd: number; preco_unit: number | null }[]) soma.set(i.comanda_id, (soma.get(i.comanda_id) ?? 0) + Number(i.qtd) * Number(i.preco_unit || 0));
  }
  const vendido = pedidos.reduce((s, p) => s + (soma.get(p.comanda_id ?? "") ?? 0) + (p.tipo === "retirada" ? 0 : Number(p.taxa_entrega || 0)) - Number(p.desconto || 0), 0);

  // Motivos de falha agrupados (o mais comum primeiro).
  const motivos = new Map<string, number>();
  for (const f of (falhas ?? []) as { erro: string | null }[]) { const k = (f.erro || "sem detalhe").slice(0, 120); motivos.set(k, (motivos.get(k) ?? 0) + 1); }

  const st = STATUS_CAMPANHA[camp.status] ?? { rotulo: camp.status, cor: "" };
  const publico = (PUBLICOS[(camp.publico?.tipo ?? "todos") as keyof typeof PUBLICOS] ?? "—")
    .replace("X dias", `${camp.publico?.dias ?? "X"} dias`).replace("X vezes", `${camp.publico?.min ?? "X"} vezes`);
  const cartao = "rounded-cartao bg-painel-cartao p-3 text-center";
  const num = (rot: string, v: string | number, dica?: string) => (
    <div className={cartao} title={dica}><div className="text-xs text-texto-suave">{rot}</div><div className="font-numero text-xl font-semibold">{v}</div></div>
  );

  return (
    <div className="w-full max-w-4xl p-4">
      <Link href="/delivery/campanhas" className="text-sm text-emerald-600">← Voltar pras campanhas</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold"><Icone nome="megafone" tamanho={19} /> {camp.nome}</h1>
          <p className={`text-sm font-medium ${st.cor}`}>{st.rotulo}</p>
        </div>
        <div className="ml-auto"><AcoesCampanha id={camp.id} status={camp.status} /></div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {num("Clientes", camp.total_clientes ?? "—", "Montado na primeira rodada dentro do horário")}
        {num("Na fila", n.fila)}
        {num("Enviadas", saiu)}
        {num("Entregues", n.entregue + n.lida)}
        {num("Lidas", n.lida, "Só conta quem deixa a confirmação de leitura ligada")}
        {num("Falharam", n.falha)}
        {num("Pedidos", pedidos.length, "Pedidos entregues que vieram pelo link desta campanha")}
        {num("Total vendido", brl(vendido))}
      </div>

      <div className="mb-4 grid gap-3 rounded-cartao bg-painel-cartao p-4 text-sm sm:grid-cols-2">
        <div><span className="text-texto-suave">Público: </span>{publico}</div>
        <div><span className="text-texto-suave">Envio: </span>{[...(camp.dias ?? [])].sort().map((d) => NOME_DIA[d]).join(", ")} das {camp.hora_ini?.slice(0, 5)} às {camp.hora_fim?.slice(0, 5)}</div>
        <div><span className="text-texto-suave">Modelo: </span>{camp.modelo}</div>
        <div><span className="text-texto-suave">Cupom: </span>{camp.cupom ?? "sem cupom"}</div>
        <div className="sm:col-span-2"><span className="text-texto-suave">Variáveis: </span>{(camp.variaveis ?? []).map((v, i) => `{{${i + 1}}} ${VARIAVEIS[v as Variavel] ?? v}`).join(" · ") || "nenhuma"}</div>
        <div><span className="text-texto-suave">Lançada: </span>{dataHora(camp.lancada_em)}</div>
        <div><span className="text-texto-suave">Concluída: </span>{dataHora(camp.concluida_em)}</div>
      </div>

      {motivos.size > 0 && (
        <div className="mb-4 rounded-cartao border border-red-500/30 p-4 text-sm">
          <p className="mb-2 font-semibold">Por que falhou</p>
          <ul className="space-y-1">
            {[...motivos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([m, q]) => <li key={m}><b>{q}×</b> {m}</li>)}
          </ul>
        </div>
      )}

      <h2 className="mb-2 font-semibold">Últimos envios</h2>
      <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-texto-fraco"><tr><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">WhatsApp</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Quando</th></tr></thead>
          <tbody className="divide-y divide-borda">
            {((recentes ?? []) as { id: string; nome: string | null; telefone: string; status: string; enviado_em: string | null; erro: string | null }[]).map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2">{e.nome ?? "—"}</td>
                <td className="px-3 py-2 text-texto-suave">{e.telefone}</td>
                <td className={`px-3 py-2 ${e.status === "falha" ? "text-red-600" : ""}`} title={e.erro ?? undefined}>{ROTULO_ENVIO[e.status] ?? e.status}</td>
                <td className="px-3 py-2 text-texto-suave">{dataHora(e.enviado_em)}</td>
              </tr>
            ))}
            {(recentes ?? []).length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-texto-fraco">Nada enviado ainda. A campanha começa no próximo horário marcado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
