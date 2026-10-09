import Link from "next/link";
import { Icone } from "@/components/icone";
import { Enviar } from "@/components/enviar";
import { createClient } from "@/lib/supabase/server";
import { listarModelosCompletos } from "@/lib/whatsapp";
import { salvarConfigWpp } from "../campanhas/actions";
import { NovoModelo } from "./novo-modelo";

export const metadata = { title: "Modelos e limites · WhatsApp" };
export const dynamic = "force-dynamic";

const STATUS_MODELO: Record<string, { rotulo: string; cor: string }> = {
  APPROVED: { rotulo: "Aprovado", cor: "text-emerald-600" },
  PENDING: { rotulo: "Em análise", cor: "text-amber-600" },
  REJECTED: { rotulo: "Recusado", cor: "text-red-600" },
  PAUSED: { rotulo: "Pausado pela Meta", cor: "text-amber-600" },
  DISABLED: { rotulo: "Desativado", cor: "text-texto-fraco" },
};
const CATEGORIA: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação" };

export default async function WhatsappPage() {
  const supabase = await createClient();
  const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [mods, { data: cfg }, { count: hoje }] = await Promise.all([
    listarModelosCompletos(),
    supabase.from("wpp_config").select("limite_dia, intervalo_auto_dias, auto_hora_ini, auto_hora_fim, preco_marketing, preco_utilidade").maybeSingle(),
    supabase.from("wpp_envios").select("id", { count: "exact", head: true }).in("status", ["enviada", "entregue", "lida", "falha"]).gte("enviado_em", `${hojeSP}T00:00:00-03:00`),
  ]);
  const c = (cfg ?? {}) as { limite_dia?: number; intervalo_auto_dias?: number; auto_hora_ini?: string; auto_hora_fim?: string; preco_marketing?: number | null; preco_utilidade?: number | null };
  const modelos = mods.ok ? [...mods.modelos].sort((a, b) => a.nome.localeCompare(b.nome)) : [];
  const inp = "rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm";
  const preco = (v: number | null | undefined) => (v != null ? String(v).replace(".", ",") : "");

  return (
    <div className="w-full max-w-5xl p-4">
      <Link href="/delivery/campanhas" className="text-sm text-emerald-600">← Voltar pras campanhas</Link>
      <h1 className="mt-2 flex items-center gap-2 text-xl font-bold"><Icone nome="zap" tamanho={19} /> Modelos e limites do WhatsApp</h1>
      <p className="mb-5 text-sm text-texto-suave">
        Fora de uma conversa aberta pelo cliente, o WhatsApp oficial só deixa mandar mensagens de modelos aprovados pela Meta.
        Crie o modelo aqui, espere aprovar (costuma levar minutos) e use nas campanhas e gatilhos.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <h2 className="mb-2 font-semibold">Modelos na Meta</h2>
          {!mods.ok && <p className="mb-3 rounded-controle bg-red-500/10 px-3 py-2 text-sm text-red-600">Não consegui ler os modelos: {mods.erro}</p>}
          <div className="space-y-2">
            {modelos.map((m) => {
              const st = STATUS_MODELO[m.status] ?? { rotulo: m.status, cor: "" };
              return (
                <div key={`${m.nome}|${m.idioma}`} className="rounded-cartao bg-painel-cartao p-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span className="font-semibold">{m.nome}</span>
                    <span className="text-texto-suave">{CATEGORIA[m.categoria] ?? m.categoria} · {m.idioma}{m.cabecalho === "IMAGE" ? " · com imagem" : ""}</span>
                    <span className={`ml-auto font-medium ${st.cor}`}>{st.rotulo}</span>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-texto-suave">{m.corpo}</p>
                  {m.motivo && <p className="mt-1 text-xs text-red-600">Motivo da recusa: {m.motivo}</p>}
                </div>
              );
            })}
            {mods.ok && modelos.length === 0 && <p className="text-sm text-texto-fraco">Nenhum modelo ainda.</p>}
          </div>
          <p className="mt-3 text-xs text-texto-fraco">Modelo com imagem no topo se cria pelo Gerenciador do WhatsApp da Meta; depois de aprovado ele aparece aqui e nas campanhas.</p>
        </div>

        <div className="space-y-6">
          <NovoModelo />

          <form action={salvarConfigWpp} className="space-y-3 rounded-cartao border border-borda p-4 text-sm">
            <h2 className="font-semibold">Limites</h2>
            <p className="text-xs text-texto-suave">Enviadas hoje: <b>{hoje ?? 0}</b> de {c.limite_dia ?? 250}.</p>
            <label className="flex items-center justify-between gap-2">Máximo de mensagens por dia
              <input name="limite_dia" defaultValue={c.limite_dia ?? 250} inputMode="numeric" className={`${inp} w-24 text-right`} />
            </label>
            <p className="text-xs text-texto-fraco">Número novo na Meta começa podendo falar com 250 pessoas por dia. O limite sobe sozinho conforme as mensagens são bem recebidas; aí é só aumentar aqui.</p>
            <label className="flex items-center justify-between gap-2">Gatilhos: mesmo cliente no máximo a cada
              <span className="flex items-center gap-1"><input name="intervalo_auto_dias" defaultValue={c.intervalo_auto_dias ?? 7} inputMode="numeric" className={`${inp} w-16 text-right`} /> dias</span>
            </label>
            <label className="flex items-center justify-between gap-2">Gatilhos saem das
              <span className="flex items-center gap-1">
                <input type="time" name="auto_hora_ini" defaultValue={c.auto_hora_ini?.slice(0, 5) ?? "10:00"} className={inp} /> às
                <input type="time" name="auto_hora_fim" defaultValue={c.auto_hora_fim?.slice(0, 5) ?? "20:00"} className={inp} />
              </span>
            </label>
            <p className="pt-2 text-xs text-texto-suave">Preço por mensagem (da sua fatura da Meta), só pra estimar o custo da campanha:</p>
            <label className="flex items-center justify-between gap-2">Marketing (R$)
              <input name="preco_marketing" defaultValue={preco(c.preco_marketing)} inputMode="decimal" placeholder="ex.: 0,35" className={`${inp} w-24 text-right`} />
            </label>
            <label className="flex items-center justify-between gap-2">Utilidade (R$)
              <input name="preco_utilidade" defaultValue={preco(c.preco_utilidade)} inputMode="decimal" placeholder="ex.: 0,05" className={`${inp} w-24 text-right`} />
            </label>
            <Enviar className="rounded-controle bg-texto px-4 py-2 font-semibold text-fundo">Salvar limites</Enviar>
          </form>
        </div>
      </div>
    </div>
  );
}
