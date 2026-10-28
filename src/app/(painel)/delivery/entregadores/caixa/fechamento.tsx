"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { fecharCaixaMotoboy } from "../../actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const r2 = (n: number) => Math.round(n * 100) / 100;
const lerValor = (t: string) => { const v = Number(t.trim().replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : 0; };
const inp = "min-h-11 w-full rounded-controle border border-borda-forte bg-painel-cartao px-3 font-numero text-lg font-bold";

function Dif({ v }: { v: number | null }) {
  if (v == null) return null;
  return v === 0
    ? <span className="pilula pilula-ok">bateu</span>
    : <span className="pilula pilula-urgente">{v > 0 ? "sobrando" : "faltando"} {brl(Math.abs(v))}</span>;
}

type Ped = { id: string; numero: number | null; nome: string; total: number; formaBoy: string | null; valorBoy: number | null; sugerida: string };

// Conferência do caixa de um motoboy: forma de cada pedido (vem a que ele
// marcou no app), dinheiro devolvido e comprovantes da maquininha, com a
// diferença calculada na hora.
export function FechamentoMotoboy({ boy, formas, pedidos }: { boy: { id: string; nome: string; troco: number }; formas: { nome: string; dinheiro: boolean }[]; pedidos: Ped[] }) {
  const router = useRouter();
  const [forma, setForma] = useState<Record<string, string>>(() => Object.fromEntries(pedidos.map((p) => [p.id, p.sugerida])));
  const [troco, setTroco] = useState(String(boy.troco).replace(".", ","));
  const [contado, setContado] = useState("");
  const [maquina, setMaquina] = useState("");
  const [obs, setObs] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const ehDinheiro = (n: string) => formas.find((f) => f.nome === n)?.dinheiro ?? false;
  const emDinheiro = r2(pedidos.filter((p) => ehDinheiro(forma[p.id])).reduce((s, p) => s + p.total, 0));
  const naMaquina = r2(pedidos.filter((p) => !ehDinheiro(forma[p.id])).reduce((s, p) => s + p.total, 0));
  const esperadoDinheiro = r2(lerValor(troco) + emDinheiro);
  const difD = contado.trim() ? r2(lerValor(contado) - esperadoDinheiro) : null;
  const difM = maquina.trim() || naMaquina === 0 ? r2(lerValor(maquina) - naMaquina) : null;

  async function fechar() {
    setMsg(null);
    if (!contado.trim()) { setMsg("Conte o dinheiro que ele devolveu e preencha."); return; }
    if (naMaquina > 0 && !maquina.trim()) { setMsg("Some os comprovantes da maquininha e preencha."); return; }
    const avisos = [difD ? `dinheiro ${difD > 0 ? "sobrando" : "faltando"} ${brl(Math.abs(difD))}` : "", difM ? `máquina ${difM > 0 ? "sobrando" : "faltando"} ${brl(Math.abs(difM))}` : ""].filter(Boolean);
    if (avisos.length && !confirm(`O caixa do ${boy.nome} não bateu: ${avisos.join(" e ")}. Fechar mesmo assim? A diferença fica registrada.`)) return;
    const r = await fecharCaixaMotoboy({ entregadorId: boy.id, troco: lerValor(troco), contado: lerValor(contado), maquina: lerValor(maquina), obs, formas: forma });
    if (!r.ok) { setMsg(r.mensagem); router.refresh(); return; }
    router.refresh();
  }

  return (
    <div className="cartao p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <div className="text-lg font-bold text-texto">{boy.nome}</div>
        <span className="text-sm text-texto-suave">{pedidos.length} pedido(s) com ele</span>
      </div>

      <div className="rotulo mb-1">Pedidos</div>
      <ul className="mb-4 divide-y divide-borda">
        {pedidos.map((p) => {
          const aviso = p.formaBoy === "Já pago" ? "ele marcou “já pago”, mas não consta pago: confira"
            : p.valorBoy != null && Math.abs(p.valorBoy - p.total) > 0.009 ? `ele marcou ${brl(p.valorBoy)}` : null;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-texto">#{p.numero ?? "—"} · {p.nome}</div>
                <div className="text-xs text-texto-suave">no app: {p.formaBoy ?? "—"}{aviso && <span className="ml-1 text-texto-marca">· {aviso}</span>}</div>
              </div>
              <select aria-label={`Forma do pedido ${p.numero ?? ""}`} value={forma[p.id]} onChange={(e) => setForma({ ...forma, [p.id]: e.target.value })} className="min-h-11 rounded-controle border border-borda-forte bg-transparent px-2 text-sm">
                {formas.map((f) => <option key={f.nome} value={f.nome}>{f.nome}</option>)}
              </select>
              <div className="w-24 text-right font-numero font-bold text-texto">{brl(p.total)}</div>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-cartao bg-destaque p-3">
          <div className="rotulo">Dinheiro</div>
          <div className="mt-1 text-xs text-texto-suave">troco que levou + teles em dinheiro ({brl(emDinheiro)})</div>
          <div className="mt-2 flex items-end gap-2">
            <label className="w-24 text-xs text-texto-suave">Troco<input value={troco} onChange={(e) => setTroco(e.target.value)} inputMode="decimal" className="min-h-11 w-full rounded-controle border border-borda-forte bg-painel-cartao px-2 font-numero" /></label>
            <div className="pb-2 text-sm text-texto-suave">= esperado <b className="font-numero text-texto">{brl(esperadoDinheiro)}</b></div>
          </div>
          <label className="mt-2 block text-xs text-texto-suave">Dinheiro que ele devolveu (contado)
            <input value={contado} onChange={(e) => setContado(e.target.value)} inputMode="decimal" placeholder="0,00" className={inp} />
          </label>
          <div className="mt-2"><Dif v={difD} /></div>
        </div>
        <div className="rounded-cartao bg-superficie-suave p-3">
          <div className="rotulo">Maquininha</div>
          <div className="mt-1 text-xs text-texto-suave">cartão e pix na máquina: esperado <b className="font-numero text-texto">{brl(naMaquina)}</b></div>
          <label className="mt-2 block text-xs text-texto-suave">Soma dos comprovantes
            <input value={maquina} onChange={(e) => setMaquina(e.target.value)} inputMode="decimal" placeholder="0,00" className={inp} />
          </label>
          <div className="mt-2"><Dif v={difM} /></div>
        </div>
      </div>

      <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)" className="mt-3 min-h-11 w-full rounded-controle border border-borda-forte bg-transparent px-3 text-sm" />
      {msg && <p className="mt-2 text-sm font-semibold text-texto-marca" role="alert">{msg}</p>}
      <BotaoAcao aoClicar={fechar} className="btn-principal mt-3 w-full">Fechar caixa do {boy.nome}</BotaoAcao>
    </div>
  );
}
