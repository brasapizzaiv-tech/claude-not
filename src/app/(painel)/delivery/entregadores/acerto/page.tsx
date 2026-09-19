import Link from "next/link";
import { Enviar } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { registrarAcertoEntregador } from "../../actions";

export const metadata = { title: "Acerto dos entregadores · Delivery" };
export const dynamic = "force-dynamic";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const horaSP = (iso: string) => Number(new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).slice(0, 2));

// Acerto do dia: pra cada entregador, quantas teles fez, quanto ganha (fixo
// do turno + valor por tele) e quanto recebeu na porta (conferência do caixa
// dele). "Registrar" grava o acerto e ele aparece em "Meus ganhos" no app.
export default async function AcertoPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const sp = await searchParams;
  const data = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? "") ? sp.data! : hojeSP();
  const supabase = await createClient();
  const [{ data: boys }, { data: peds }, { data: acertos }] = await Promise.all([
    supabase.from("entregadores").select("id, nome, valor_fixo_dia, valor_fixo_noite, valor_tele").eq("ativo", true).order("nome"),
    supabase.from("delivery_pedidos").select("id, entregador_id, status, taxa_motoboy, recebido_forma, recebido_valor, saiu_em, entregue_em, pdv_comandas(numero)")
      .eq("tipo", "entrega").not("entregador_id", "is", null)
      .gte("entregue_em", `${data}T00:00:00-03:00`).lte("entregue_em", `${data}T23:59:59-03:00`).eq("status", "entregue"),
    supabase.from("entregador_acertos").select("entregador_id, total, fixo, teles_qtd, teles_valor, recebido_dinheiro, recebido_cartao, recebido_pix").eq("data", data),
  ]);
  type Ped = { id: string; entregador_id: string; status: string; taxa_motoboy: number | null; recebido_forma: string | null; recebido_valor: number | null; saiu_em: string | null; entregue_em: string | null; pdv_comandas: { numero: number } | { numero: number }[] | null };
  const pedidos = (peds as unknown as Ped[]) ?? [];
  const jaFeito = new Map(((acertos as { entregador_id: string; total: number; fixo: number; teles_qtd: number; teles_valor: number; recebido_dinheiro: number; recebido_cartao: number; recebido_pix: number }[]) ?? []).map((a) => [a.entregador_id, a]));
  const addDias = (iso: string, n: number) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };

  const linhas = ((boys as { id: string; nome: string; valor_fixo_dia: number | null; valor_fixo_noite: number | null; valor_tele: number | null }[]) ?? []).map((b) => {
    const meus = pedidos.filter((p) => p.entregador_id === b.id);
    const teles = meus.reduce((s, p) => s + Number(p.taxa_motoboy ?? 0), 0);
    // Turno: entregou algo antes das 15h = almoço; depois = noite (pode ser os dois).
    const fezDia = meus.some((p) => horaSP(p.entregue_em ?? p.saiu_em ?? "") < 15);
    const fezNoite = meus.some((p) => horaSP(p.entregue_em ?? p.saiu_em ?? "") >= 15);
    const fixo = (fezDia ? Number(b.valor_fixo_dia ?? 0) : 0) + (fezNoite ? Number(b.valor_fixo_noite ?? 0) : 0);
    const rec = { Dinheiro: 0, Cartão: 0, Pix: 0 } as Record<string, number>;
    for (const p of meus) if (p.recebido_forma && p.recebido_forma in rec) rec[p.recebido_forma] += Number(p.recebido_valor ?? 0);
    return { b, meus, teles, fixo, fezDia, fezNoite, total: teles + fixo, rec, feito: jaFeito.get(b.id) ?? null };
  }).filter((l) => l.meus.length > 0 || l.feito);

  return (
    <div className="mx-auto max-w-4xl p-4">
      <Link href="/delivery/entregadores" className="text-sm text-emerald-600">← Entregadores</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold"><Icone nome="dinheiro" tamanho={19} /> Acerto dos entregadores</h1>
        <form className="ml-auto flex items-center gap-2">
          <Link href={`?data=${addDias(data, -1)}`} className="rounded-controle border border-borda-forte px-2 py-1 text-sm">‹</Link>
          <input type="date" name="data" defaultValue={data} className="rounded-controle border border-borda-forte bg-transparent px-2 py-1 text-sm" />
          <button className="rounded-controle bg-zinc-800 px-3 py-1 text-sm text-white">Ver</button>
          <Link href={`?data=${addDias(data, 1)}`} className="rounded-controle border border-borda-forte px-2 py-1 text-sm">›</Link>
        </form>
      </div>
      <p className="mb-4 text-xs text-texto-suave">Fixo = valor do turno (almoço se entregou antes das 15h, noite se depois) + teles = soma do valor por entrega (da área, ou o valor do entregador). “Recebido” é o que ele trouxe da rua — confira com o caixa antes de acertar.</p>

      {linhas.length === 0 && <p className="py-10 text-center text-texto-suave">Nenhuma entrega concluída nesse dia.</p>}
      <div className="space-y-3">
        {linhas.map(({ b, meus, teles, fixo, fezDia, fezNoite, total, rec, feito }) => (
          <div key={b.id} className="rounded-cartao border border-borda p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-lg font-bold">{b.nome}</div>
              <span className="text-xs text-texto-suave">{fezDia && <span className="mr-1.5 inline-flex items-center gap-1"><Icone nome="dia" tamanho={12} /> almoço</span>}
                {fezNoite && <span className="inline-flex items-center gap-1"><Icone nome="noite" tamanho={12} /> noite</span>}</span>
              <div className="ml-auto text-right">
                <div className="text-xs text-texto-suave">a pagar</div>
                <div className="text-xl font-bold text-emerald-600">{brl(total)}</div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
              <div className="rounded-controle bg-superficie-suave p-2"><div className="text-mini text-texto-suave">Entregas</div><div className="font-semibold">{meus.length}</div></div>
              <div className="rounded-controle bg-superficie-suave p-2"><div className="text-mini text-texto-suave">Teles</div><div className="font-semibold">{brl(teles)}</div></div>
              <div className="rounded-controle bg-superficie-suave p-2"><div className="text-mini text-texto-suave">Fixo</div><div className="font-semibold">{brl(fixo)}</div></div>
              <div className="rounded-controle bg-amber-50 p-2 dark:bg-amber-950/30"><div className="text-mini text-texto-suave">Trouxe em dinheiro</div><div className="font-semibold">{brl(rec.Dinheiro)}</div></div>
              <div className="rounded-controle bg-superficie-suave p-2"><div className="text-mini text-texto-suave">Cartão / Pix</div><div className="font-semibold">{brl(rec.Cartão)} / {brl(rec.Pix)}</div></div>
            </div>
            <details className="mt-2 text-xs text-texto-suave">
              <summary className="cursor-pointer">ver as {meus.length} entregas</summary>
              <ul className="mt-1 space-y-0.5">
                {meus.map((p) => { const c = Array.isArray(p.pdv_comandas) ? p.pdv_comandas[0] : p.pdv_comandas; return (
                  <li key={p.id}>#{c?.numero ?? "—"} · tele {brl(Number(p.taxa_motoboy ?? 0))} · {p.recebido_forma ?? "—"} {p.recebido_valor ? brl(Number(p.recebido_valor)) : ""}</li>
                ); })}
              </ul>
            </details>
            <div className="mt-3">
              {feito ? (
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-600">✓ Acertado: {brl(Number(feito.total))} ({feito.teles_qtd} teles + fixo {brl(Number(feito.fixo))})</span>
              ) : (
                <form action={registrarAcertoEntregador} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="entregador_id" value={b.id} />
                  <input type="hidden" name="data" value={data} />
                  <input type="hidden" name="teles_qtd" value={meus.length} />
                  <input type="hidden" name="teles_valor" value={teles} />
                  <input type="hidden" name="recebido_dinheiro" value={rec.Dinheiro} />
                  <input type="hidden" name="recebido_cartao" value={rec.Cartão} />
                  <input type="hidden" name="recebido_pix" value={rec.Pix} />
                  <label className="text-xs text-texto-suave">Fixo (R$)</label>
                  <input name="fixo" defaultValue={fixo} inputMode="decimal" className="w-24 rounded-controle border border-borda-forte bg-transparent px-2 py-1 text-sm" />
                  <input name="obs" placeholder="obs (opcional)" className="flex-1 rounded-controle border border-borda-forte bg-transparent px-2 py-1 text-sm" />
                  <Enviar className="rounded-controle bg-texto px-4 py-1.5 text-sm font-semibold text-fundo">Registrar acerto</Enviar>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
