import Link from "next/link";
import { Enviar } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { criarEntregador, criarEntregadorDoColaborador, alternarEntregador, salvarValoresEntregador, novoCodigoEntregador } from "../actions";

export const metadata = { title: "Entregadores · Delivery" };
export const dynamic = "force-dynamic";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const agoraMs = () => Date.now(); // fora do componente (regra de pureza)
const inp = "rounded-controle border border-borda-forte bg-transparent px-2 py-1.5 text-sm ";

// Entregadores: cadastro, link pessoal do app (/entrega/{token}), valores
// (fixo por turno + por tele + regra do almoço) e onde está agora (GPS do app).
// Os fixos vêm de Colaboradores; os eventuais são cadastrados aqui.
export default async function EntregadoresPage() {
  const supabase = await createClient();
  const h = await headers();
  const origem = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "www.brasarestaurante.com.br"}`;
  const [{ data }, { data: cols }] = await Promise.all([
    supabase.from("entregadores")
      .select("id, nome, telefone, ativo, token, codigo, colaborador_id, valor_fixo_dia, valor_fixo_noite, valor_tele, gratis_incluidas_dia, valor_gratis_extra_dia, ultima_lat, ultima_lng, ultima_pos_em")
      .order("nome"),
    supabase.from("colaboradores").select("id, nome, nome_social").eq("ativo", true).order("nome"),
  ]);
  const lista = (data ?? []) as { id: string; nome: string; telefone: string | null; ativo: boolean; token: string | null; codigo: string | null; colaborador_id: string | null; valor_fixo_dia: number | null; valor_fixo_noite: number | null; valor_tele: number | null; gratis_incluidas_dia: number | null; valor_gratis_extra_dia: number | null; ultima_lat: number | null; ultima_lng: number | null; ultima_pos_em: string | null }[];
  const ligados = new Set(lista.map((e) => e.colaborador_id).filter(Boolean));
  const livres = ((cols ?? []) as { id: string; nome: string; nome_social: string | null }[]).filter((c) => !ligados.has(c.id));
  const agora = agoraMs();
  // QR de cada entregador = o link pessoal; o app lê na tela inicial.
  const qrs = new Map(await Promise.all(lista.filter((e) => e.token).map(async (e) => [e.id, await QRCode.toString(`${origem}/entrega/${e.token}`, { type: "svg", margin: 1, width: 180 })] as const)));
  const codigoFmt = (c: string) => `${c.slice(0, 3)} ${c.slice(3)}`;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <Link href="/delivery" className="text-sm font-semibold text-texto-marca hover:underline">← Voltar pro painel</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto"><Icone nome="entrega" tamanho={19} /> Entregadores</h1>
        <Link href="/delivery/entregadores/acerto" className="ml-auto rounded-controle bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-white dark:bg-zinc-700"><span className="inline-flex items-center gap-1.5"><Icone nome="dinheiro" tamanho={14} /> Acerto do dia</span></Link>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <form action={criarEntregadorDoColaborador} className="cartao flex flex-col gap-2 p-4">
          <div className="rotulo">Fixo · puxar de Colaboradores</div>
          <select name="colaborador_id" required defaultValue="" className="min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm">
            <option value="" disabled>Escolha o colaborador…</option>
            {livres.map((c) => <option key={c.id} value={c.id}>{c.nome_social || c.nome}</option>)}
          </select>
          <p className="text-xs text-texto-suave">Nome e WhatsApp vêm da ficha. Já entra com a regra dos fixos (almoço R$ 70 com 3 teles grátis, depois R$ 3; noite R$ 50 + área), dá pra mudar depois.</p>
          <Enviar className="btn-principal">Adicionar fixo</Enviar>
        </form>
        <form action={criarEntregador} className="cartao flex flex-col gap-2 p-4">
          <div className="rotulo">Eventual · só no delivery</div>
          <input name="nome" required placeholder="Nome" className="min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm" />
          <input name="telefone" placeholder="Telefone (opcional)" className="min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm" />
          <Enviar className="btn-secundario">Adicionar eventual</Enviar>
        </form>
      </div>

      <div className="space-y-3">
        {lista.length === 0 && <p className="text-sm text-texto-suave">Nenhum entregador cadastrado.</p>}
        {lista.map((e) => {
          const link = e.token ? `${origem}/entrega/${e.token}` : null;
          const posMin = e.ultima_pos_em ? Math.round((agora - new Date(e.ultima_pos_em).getTime()) / 60000) : null;
          return (
            <div key={e.id} className={`rounded-cartao border p-3 ${e.ativo ? "border-borda" : "border-borda opacity-50 "}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-bold">{e.nome}<span className={e.colaborador_id ? "pilula" : "pilula pilula-neutra"}>{e.colaborador_id ? "fixo · Colaboradores" : "eventual"}</span></div>
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
                  <Enviar className="rounded-controle border border-borda-forte px-3 py-1.5 text-sm">{e.ativo ? "Desativar" : "Ativar"}</Enviar>
                </form>
              </div>

              {link && (
                <div className="mt-2 rounded-controle bg-superficie-suave px-3 py-2 text-xs">
                  {/* Entrada no app: código de 6 números ou QR (migration 0227). */}
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-texto-suave">Código de entrada no app:</span>
                    <span className="text-xl font-bold tracking-widest text-texto">{e.codigo ? codigoFmt(e.codigo) : "—"}</span>
                    <form action={novoCodigoEntregador}>
                      <input type="hidden" name="id" value={e.id} />
                      <Enviar className="rounded-controle border border-borda-forte px-2 py-1">Trocar código</Enviar>
                    </form>
                    <a href={`https://web.whatsapp.com/send?phone=${e.telefone ? (d => d.length > 11 ? d : "55" + d)(e.telefone.replace(/\D/g, "")) : ""}&text=${encodeURIComponent(`Seu acesso ao app de entregas da Brasa.
No app Motelli Entregador, digite o código: ${e.codigo ? codigoFmt(e.codigo) : ""}
Ou abra este link: ${link}
O código é seu, não passe pra ninguém.`)}`} target="_blank" rel="noreferrer" className="ml-auto rounded-controle bg-texto px-2 py-1 font-semibold text-fundo">Mandar no WhatsApp</a>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer font-semibold text-texto-suave">Mostrar QR code e link</summary>
                    <div className="mt-2 flex flex-wrap items-start gap-3">
                      {qrs.get(e.id) && <div className="rounded-controle bg-white p-2" dangerouslySetInnerHTML={{ __html: qrs.get(e.id) as string }} />}
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-texto-suave">No app, toque em <b>Ler QR code</b> e aponte pra esta tela.</p>
                        <code className="block select-all break-all text-texto-suave">{link}</code>
                      </div>
                    </div>
                  </details>
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
                <div><label className="block text-mini text-texto-suave">Por tele (R$)</label><input name="valor_tele" defaultValue={e.valor_tele ?? ""} inputMode="decimal" placeholder="da área" className={`${inp} w-24`} /></div>
                <div><label className="block text-mini text-texto-suave">Almoço: grátis no fixo</label><input name="gratis_incluidas_dia" defaultValue={e.gratis_incluidas_dia ?? ""} inputMode="numeric" placeholder="sem regra" className={`${inp} w-24`} /></div>
                <div><label className="block text-mini text-texto-suave">Grátis depois (R$)</label><input name="valor_gratis_extra_dia" defaultValue={e.valor_gratis_extra_dia ?? ""} inputMode="decimal" className={`${inp} w-24`} /></div>
                <Enviar className="rounded-controle border border-borda-forte px-3 py-1.5 font-semibold">Salvar valores</Enviar>
                <span className="w-full text-texto-fraco">
                  {e.gratis_incluidas_dia != null
                    ? `Almoço: ${brl(Number(e.valor_fixo_dia ?? 0))} cobre ${e.gratis_incluidas_dia} teles grátis, depois ${brl(Number(e.valor_gratis_extra_dia ?? 0))} cada; tele cobrada paga a área. Noite: ${brl(Number(e.valor_fixo_noite ?? 0))} + área de todas.`
                    : e.valor_tele != null ? `Toda tele: valor da área (sem área, ${brl(Number(e.valor_tele))}).` : "Toda tele paga o valor da área."}
                </span>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
