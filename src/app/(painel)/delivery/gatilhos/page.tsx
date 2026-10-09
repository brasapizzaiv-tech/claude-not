import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { listarModelosCompletos } from "@/lib/whatsapp";
import { GATILHOS } from "@/lib/whatsapp-catalogo";
import { CartoesGatilhos, type GatilhoSalvo } from "./gatilhos-client";

export const metadata = { title: "Gatilhos automáticos · Delivery" };
export const dynamic = "force-dynamic";

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const ROTULO_ENVIO: Record<string, string> = { fila: "Na fila", enviada: "Enviada", entregue: "Entregue", lida: "Lida", falha: "Falhou", pulada: "Não enviada" };

function trintaDiasAtras() {
  return new Date(Date.now() - 30 * 86400000).toISOString();
}

export default async function GatilhosPage() {
  const supabase = await createClient();
  const desde = trintaDiasAtras();
  const [mods, { data: gRows }, { data: cupRows }, { data: cfg }, { data: envRows }, { data: ultimos }] = await Promise.all([
    listarModelosCompletos(),
    supabase.from("wpp_gatilhos").select("chave, ativo, modelo, idioma, variaveis, dias, cupom, imagem_url"),
    supabase.from("cupons").select("codigo").eq("ativo", true).order("codigo"),
    supabase.from("wpp_config").select("intervalo_auto_dias, auto_hora_ini, auto_hora_fim").maybeSingle(),
    supabase.from("wpp_envios").select("gatilho").not("gatilho", "is", null).in("status", ["enviada", "entregue", "lida"]).gte("enviado_em", desde).limit(5000),
    supabase.from("wpp_envios").select("id, gatilho, nome, telefone, status, enviado_em, criado_em, erro").not("gatilho", "is", null).order("criado_em", { ascending: false }).limit(40),
  ]);
  const salvos: Record<string, GatilhoSalvo> = {};
  for (const g of (gRows ?? []) as (GatilhoSalvo & { chave: string })[]) salvos[g.chave] = g;
  const enviados30: Record<string, number> = {};
  for (const e of (envRows ?? []) as { gatilho: string }[]) enviados30[e.gatilho] = (enviados30[e.gatilho] ?? 0) + 1;
  const c = cfg as { intervalo_auto_dias: number; auto_hora_ini: string; auto_hora_fim: string } | null;
  const titulo = Object.fromEntries(GATILHOS.map((g) => [g.chave, g.titulo]));

  return (
    <div className="w-full max-w-5xl p-4">
      <Link href="/delivery/campanhas" className="text-sm text-emerald-600">← Voltar pras campanhas</Link>
      <h1 className="mt-2 flex items-center gap-2 text-xl font-bold"><Icone nome="rapido" tamanho={19} /> Gatilhos automáticos</h1>
      <p className="mb-1 text-sm text-texto-suave">Mensagens que saem sozinhas quando algo acontece com o cliente. Cada uma usa um modelo aprovado pela Meta.</p>
      <p className="mb-4 text-sm text-texto-suave">
        Saem das {c?.auto_hora_ini?.slice(0, 5) ?? "10:00"} às {c?.auto_hora_fim?.slice(0, 5) ?? "20:00"}
        {c?.intervalo_auto_dias ? `, e o mesmo cliente recebe no máximo uma a cada ${c.intervalo_auto_dias} dias` : ""}.{" "}
        <Link href="/delivery/whatsapp" className="text-emerald-600 underline">Mudar em Modelos e limites</Link>
      </p>
      {!mods.ok && <p className="mb-3 rounded-controle bg-red-500/10 px-3 py-2 text-sm text-red-600">Não consegui ler os modelos na Meta: {mods.erro}</p>}

      <CartoesGatilhos
        modelos={mods.ok ? mods.modelos : []}
        salvos={salvos}
        cupons={((cupRows as { codigo: string }[]) ?? []).map((x) => x.codigo)}
        enviados30={enviados30}
      />

      <h2 className="mb-2 mt-8 font-semibold">Histórico de disparos</h2>
      <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-texto-fraco"><tr><th className="px-3 py-2">Gatilho</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Quando</th></tr></thead>
          <tbody className="divide-y divide-borda">
            {((ultimos ?? []) as { id: string; gatilho: string; nome: string | null; telefone: string; status: string; enviado_em: string | null; criado_em: string; erro: string | null }[]).map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2">{titulo[e.gatilho] ?? e.gatilho}</td>
                <td className="px-3 py-2">{e.nome ?? e.telefone}</td>
                <td className={`px-3 py-2 ${e.status === "falha" ? "text-red-600" : ""}`} title={e.erro ?? undefined}>{ROTULO_ENVIO[e.status] ?? e.status}</td>
                <td className="px-3 py-2 text-texto-suave">{dataHora(e.enviado_em ?? e.criado_em)}</td>
              </tr>
            ))}
            {(ultimos ?? []).length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-texto-fraco">Nenhum disparo ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
