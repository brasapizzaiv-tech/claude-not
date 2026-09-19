import Link from "next/link";
import { Icone } from "@/components/icone";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { criarEntregador, alternarEntregador, salvarValoresEntregador } from "../actions";

export const metadata = { title: "Entregadores · Delivery" };
export const dynamic = "force-dynamic";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const agoraMs = () => Date.now(); // fora do componente (regra de pureza)
const inp = "rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none dark:border-zinc-700";

// Entregadores: cadastro, link pessoal do app (/entrega/{token}), valores
// (fixo por turno + por tele) e onde está agora (GPS do app).
export default async function EntregadoresPage() {
  const supabase = await createClient();
  const h = await headers();
  const origem = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "www.brasarestaurante.com.br"}`;
  const { data } = await supabase
    .from("entregadores")
    .select("id, nome, telefone, ativo, token, valor_fixo_dia, valor_fixo_noite, valor_tele, ultima_lat, ultima_lng, ultima_pos_em")
    .order("nome");
  const lista = (data ?? []) as { id: string; nome: string; telefone: string | null; ativo: boolean; token: string | null; valor_fixo_dia: number | null; valor_fixo_noite: number | null; valor_tele: number | null; ultima_lat: number | null; ultima_lng: number | null; ultima_pos_em: string | null }[];
  const agora = agoraMs();

  return (
    <div className="mx-auto max-w-3xl p-4">
      <Link href="/delivery" className="text-sm text-emerald-600">← Voltar pro painel</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold"><Icone nome="entrega" tamanho={19} /> Entregadores</h1>
        <Link href="/delivery/entregadores/acerto" className="ml-auto rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-white dark:bg-zinc-700"><span className="inline-flex items-center gap-1.5"><Icone nome="dinheiro" tamanho={14} /> Acerto do dia</span></Link>
      </div>

      <form action={criarEntregador} className="mb-6 flex flex-wrap gap-2">
        <input name="nome" required placeholder="Nome" className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
        <input name="telefone" placeholder="Telefone (opcional)" className="w-44 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
        <button className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white">Adicionar</button>
      </form>

      <div className="space-y-3">
        {lista.length === 0 && <p className="text-sm text-zinc-500">Nenhum entregador cadastrado.</p>}
        {lista.map((e) => {
          const link = e.token ? `${origem}/entrega/${e.token}` : null;
          const posMin = e.ultima_pos_em ? Math.round((agora - new Date(e.ultima_pos_em).getTime()) / 60000) : null;
          return (
            <div key={e.id} className={`rounded-2xl border p-3 ${e.ativo ? "border-zinc-200 dark:border-zinc-800" : "border-zinc-200 opacity-50 dark:border-zinc-800"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1">
                  <div className="font-bold">{e.nome}</div>
                  <div className="text-xs text-zinc-500">
                    {e.telefone ?? "sem telefone"}
                    {posMin != null && (
                      <> · {posMin <= 3 ? <span className="inline-flex items-center gap-1.5 text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500" /> online agora</span> : `visto há ${posMin} min`}
                        {e.ultima_lat != null && <> · <a href={`https://www.google.com/maps/search/?api=1&query=${e.ultima_lat},${e.ultima_lng}`} target="_blank" rel="noreferrer" className="underline">ver no mapa</a></>}
                      </>
                    )}
                  </div>
                </div>
                <form action={alternarEntregador}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="ativo" value={e.ativo ? "1" : "0"} />
                  <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">{e.ativo ? "Desativar" : "Ativar"}</button>
                </form>
              </div>

              {link && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900">
                  <span className="text-zinc-500">Link do app:</span>
                  <code className="select-all break-all text-zinc-700 dark:text-zinc-300">{link}</code>
                  <a href={`https://web.whatsapp.com/send?phone=${e.telefone ? "55" + e.telefone.replace(/\D/g, "") : ""}&text=${encodeURIComponent(`Seu app de entregas da Brasa: ${link}\nAbra no celular e toque em "Adicionar à tela inicial".`)}`} target="_blank" rel="noreferrer" className="ml-auto rounded-lg bg-emerald-600 px-2 py-1 font-semibold text-white">Mandar no WhatsApp</a>
                </div>
              )}

              {e.token && (
                <details className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                  <summary className="cursor-pointer font-semibold">Rastreamento em segundo plano (app Traccar Client)</summary>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                    <li>No celular do entregador, instale o <b>Traccar Client</b> (Play Store / App Store, gratuito).</li>
                    <li>Em <b>Identificador do dispositivo</b>, cole: <code className="select-all">{e.token}</code></li>
                    <li>Em <b>URL do servidor</b>, cole: <code className="select-all">{origem}/api/rastreio</code></li>
                    <li>Frequência: <b>15</b> s · Distância: 0 · Ângulo: 0 · Precisão: alta. Ligue o serviço (chave no topo).</li>
                    <li>No Android, em Configurações → Bateria, deixe o Traccar <b>sem restrição</b>; no iPhone, permissão de localização <b>Sempre</b>.</li>
                  </ol>
                  <p className="mt-1">Com isso a posição chega mesmo com a tela apagada. O botão GPS do app de entregas continua funcionando como alternativa.</p>
                </details>
              )}

              <form action={salvarValoresEntregador} className="mt-2 flex flex-wrap items-end gap-2 text-xs">
                <input type="hidden" name="id" value={e.id} />
                <div><label className="block text-[11px] text-zinc-500">Fixo almoço (R$)</label><input name="valor_fixo_dia" defaultValue={e.valor_fixo_dia ?? ""} inputMode="decimal" className={`${inp} w-24`} /></div>
                <div><label className="block text-[11px] text-zinc-500">Fixo noite (R$)</label><input name="valor_fixo_noite" defaultValue={e.valor_fixo_noite ?? ""} inputMode="decimal" className={`${inp} w-24`} /></div>
                <div><label className="block text-[11px] text-zinc-500">Por tele (R$)</label><input name="valor_tele" defaultValue={e.valor_tele ?? ""} inputMode="decimal" className={`${inp} w-24`} /></div>
                <button className="rounded-lg border border-zinc-300 px-3 py-1.5 font-semibold dark:border-zinc-700">Salvar valores</button>
                <span className="text-zinc-400">{e.valor_tele != null ? `hoje: ${brl(Number(e.valor_tele))}/tele` : "a tele usa o valor da área"}</span>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
