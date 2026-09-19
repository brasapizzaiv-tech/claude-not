import Link from "next/link";
import { Icone } from "@/components/icone";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { criarEntregador, alternarEntregador, salvarValoresEntregador } from "../actions";

export const metadata = { title: "Entregadores · Delivery" };
export const dynamic = "force-dynamic";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const agoraMs = () => Date.now(); // fora do componente (regra de pureza)
const inp = "rounded-controle border border-borda-forte bg-transparent px-2 py-1.5 text-sm ";

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
        <Link href="/delivery/entregadores/acerto" className="ml-auto rounded-controle bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-white dark:bg-zinc-700"><span className="inline-flex items-center gap-1.5"><Icone nome="dinheiro" tamanho={14} /> Acerto do dia</span></Link>
      </div>

      <form action={criarEntregador} className="mb-6 flex flex-wrap gap-2">
        <input name="nome" required placeholder="Nome" className="flex-1 rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm " />
        <input name="telefone" placeholder="Telefone (opcional)" className="w-44 rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm " />
        <button className="rounded-controle bg-texto px-4 py-2 font-semibold text-fundo">Adicionar</button>
      </form>

      <div className="space-y-3">
        {lista.length === 0 && <p className="text-sm text-texto-suave">Nenhum entregador cadastrado.</p>}
        {lista.map((e) => {
          const link = e.token ? `${origem}/entrega/${e.token}` : null;
          const posMin = e.ultima_pos_em ? Math.round((agora - new Date(e.ultima_pos_em).getTime()) / 60000) : null;
          return (
            <div key={e.id} className={`rounded-cartao border p-3 ${e.ativo ? "border-borda" : "border-borda opacity-50 "}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1">
                  <div className="font-bold">{e.nome}</div>
                  <div className="text-xs text-texto-suave">
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
                  <button className="rounded-controle border border-borda-forte px-3 py-1.5 text-sm">{e.ativo ? "Desativar" : "Ativar"}</button>
                </form>
              </div>

              {link && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-controle bg-superficie-suave px-3 py-2 text-xs">
                  <span className="text-texto-suave">Link do app:</span>
                  <code className="select-all break-all text-texto-suave">{link}</code>
                  <a href={`https://web.whatsapp.com/send?phone=${e.telefone ? "55" + e.telefone.replace(/\D/g, "") : ""}&text=${encodeURIComponent(`Seu app de entregas da Brasa: ${link}\nAbra no celular e toque em "Adicionar à tela inicial".`)}`} target="_blank" rel="noreferrer" className="ml-auto rounded-controle bg-texto px-2 py-1 font-semibold text-fundo">Mandar no WhatsApp</a>
                </div>
              )}

              {e.token && (
                <details className="mt-2 rounded-controle bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
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
                <div><label className="block text-mini text-texto-suave">Fixo almoço (R$)</label><input name="valor_fixo_dia" defaultValue={e.valor_fixo_dia ?? ""} inputMode="decimal" className={`${inp} w-24`} /></div>
                <div><label className="block text-mini text-texto-suave">Fixo noite (R$)</label><input name="valor_fixo_noite" defaultValue={e.valor_fixo_noite ?? ""} inputMode="decimal" className={`${inp} w-24`} /></div>
                <div><label className="block text-mini text-texto-suave">Por tele (R$)</label><input name="valor_tele" defaultValue={e.valor_tele ?? ""} inputMode="decimal" className={`${inp} w-24`} /></div>
                <button className="rounded-controle border border-borda-forte px-3 py-1.5 font-semibold">Salvar valores</button>
                <span className="text-texto-fraco">{e.valor_tele != null ? `hoje: ${brl(Number(e.valor_tele))}/tele` : "a tele usa o valor da área"}</span>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
