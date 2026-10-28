import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { formaSugerida, formasDoMotoboy, pedidosComMotoboy } from "@/lib/caixa-motoboy";
import { FechamentoMotoboy } from "./fechamento";

export const metadata = { title: "Caixa dos motoboys · Delivery" };
export const dynamic = "force-dynamic";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const horaFmt = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

// Caixa dos motoboys (migration 0262): o que está com cada boy (entregue e
// não pago) e a conferência do fim do turno — dinheiro (troco + teles em
// dinheiro) e comprovantes da maquininha. Fechar lança cada pedido no caixa.
export default async function CaixaMotoboysPage() {
  const supabase = await createClient();
  const hoje = hojeSP();
  const [pedidos, formas, { data: boys }, { data: fechs }] = await Promise.all([
    pedidosComMotoboy(supabase),
    formasDoMotoboy(),
    supabase.from("entregadores").select("id, nome, troco_inicial").order("nome"),
    supabase.from("entregador_fechamentos").select("id, entregador_id, criado_em, troco, esperado_dinheiro, contado_dinheiro, esperado_maquina, conferido_maquina, pedidos, fechado_por, obs")
      .gte("criado_em", `${hoje}T00:00:00-03:00`).order("criado_em", { ascending: false }),
  ]);
  const lista = (boys as { id: string; nome: string; troco_inicial: number | null }[] | null) ?? [];
  const nomes = formas.map((f) => f.nome);
  const comBoy = lista.map((b) => ({ b, peds: pedidos.filter((p) => p.entregadorId === b.id) })).filter((x) => x.peds.length > 0);
  type Fech = { id: string; entregador_id: string; criado_em: string; troco: number; esperado_dinheiro: number; contado_dinheiro: number; esperado_maquina: number; conferido_maquina: number; pedidos: string[]; fechado_por: string | null; obs: string | null };
  const fechados = (fechs as Fech[] | null) ?? [];
  const nomeBoy = new Map(lista.map((b) => [b.id, b.nome]));

  return (
    <div className="mx-auto max-w-3xl p-4">
      <Link href="/delivery/entregadores" className="text-sm font-semibold text-texto-marca hover:underline">← Entregadores</Link>
      <h1 className="mb-1 mt-2 flex items-center gap-2 font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto"><Icone nome="carteira" tamanho={19} /> Caixa dos motoboys</h1>
      <p className="mb-4 text-sm text-texto-suave">No fim do turno o boy devolve o dinheiro (o troco que levou + as teles em dinheiro) e as maquininhas. Confira o dinheiro e os comprovantes, ajuste a forma de algum pedido se ele marcou errado e feche: cada pedido entra no caixa. Pix online já sai pago e não aparece aqui. O caixa do salão só fecha depois que todos os motoboys fecharem.</p>

      {comBoy.length === 0 && <p className="cartao p-6 text-center text-texto-suave">Nenhum pedido com motoboy esperando conferência.</p>}
      <div className="space-y-4">
        {comBoy.map(({ b, peds }) => (
          <FechamentoMotoboy
            key={b.id}
            boy={{ id: b.id, nome: b.nome, troco: Number(b.troco_inicial ?? 63) }}
            formas={formas.map((f) => ({ nome: f.nome, dinheiro: f.tipo === "dinheiro" }))}
            pedidos={peds.map((p) => ({ id: p.id, numero: p.numero, nome: p.nome, total: p.total, formaBoy: p.formaBoy, valorBoy: p.valorBoy, sugerida: formaSugerida(p, nomes) }))}
          />
        ))}
      </div>

      {fechados.length > 0 && (
        <div className="cartao mt-6 p-4">
          <div className="rotulo mb-2">Fechados hoje</div>
          <ul className="divide-y divide-borda text-sm">
            {fechados.map((f) => {
              const dd = Math.round((Number(f.contado_dinheiro) - Number(f.esperado_dinheiro)) * 100) / 100;
              const dm = Math.round((Number(f.conferido_maquina) - Number(f.esperado_maquina)) * 100) / 100;
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="flex-1">
                    <div className="font-semibold">{nomeBoy.get(f.entregador_id) ?? "—"} · {horaFmt(f.criado_em)}</div>
                    <div className="text-xs text-texto-suave">{f.pedidos.length} pedido(s) · troco {brl(Number(f.troco))}{f.fechado_por ? ` · por ${f.fechado_por}` : ""}{f.obs ? ` · ${f.obs}` : ""}</div>
                  </div>
                  <div className="text-right font-numero text-xs">
                    <div>dinheiro {brl(Number(f.contado_dinheiro))} {dd === 0 ? <span className="pilula pilula-ok">ok</span> : <span className="pilula pilula-urgente">{dd > 0 ? "sobrou" : "faltou"} {brl(Math.abs(dd))}</span>}</div>
                    <div className="mt-1">máquina {brl(Number(f.conferido_maquina))} {dm === 0 ? <span className="pilula pilula-ok">ok</span> : <span className="pilula pilula-urgente">{dm > 0 ? "sobrou" : "faltou"} {brl(Math.abs(dm))}</span>}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
