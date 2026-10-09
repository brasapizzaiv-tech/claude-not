// Campanhas e gatilhos automáticos pelo WhatsApp oficial (Meta).
//
// Toda mensagem é um modelo aprovado pela Meta; as variáveis {{1}}, {{2}}...
// recebem dados escolhidos na tela (nome, link, cupom, cashback...).
// A rotina /api/whatsapp/disparos roda a cada 5 minutos: dispara os gatilhos
// (dentro da janela de horário dos automáticos) e manda as campanhas em lotes,
// sem passar do limite diário do número na Meta.
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarModeloWpp, whatsappConfigurado } from "@/lib/whatsapp";

export const SITE = "https://www.brasarestaurante.com.br";

import { GATILHOS, VARIAVEIS, PUBLICOS, type GatilhoDef, type Variavel, type TipoPublico } from "@/lib/whatsapp-catalogo";
export { GATILHOS, VARIAVEIS, PUBLICOS, type GatilhoDef, type Variavel, type TipoPublico };

// ------------------------------------------------------------------ helpers
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const primeiroNome = (nome: string | null | undefined) => {
  const n = String(nome ?? "").trim().split(/\s+/)[0] || "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "cliente";
};

export function linkCardapio(opts: { campanhaId?: string | null; cupom?: string | null }) {
  const qs = new URLSearchParams();
  if (opts.campanhaId) qs.set("c", opts.campanhaId);
  if (opts.cupom) qs.set("cupom", opts.cupom);
  const s = qs.toString();
  return `${SITE}/pedir${s ? `?${s}` : ""}`;
}

type Ctx = {
  nome: string | null; link: string; cupom: string | null;
  extra?: Record<string, unknown> | null; saldo?: number | null;
};
export function resolverVariaveis(vars: string[], ctx: Ctx): string[] {
  const ex = ctx.extra ?? {};
  return vars.map((v) => {
    switch (v) {
      case "nome": return primeiroNome(ctx.nome);
      case "link": return ctx.link;
      case "cupom": return String(ex.cupom ?? ctx.cupom ?? "") || "-";
      case "cashback_saldo": return brl(Number(ctx.saldo ?? ex.valor ?? 0));
      case "cashback_valor": return brl(Number(ex.valor ?? ctx.saldo ?? 0));
      case "cashback_vence": return dataBR(ex.vence as string) || "-";
      case "dias_sem": return String(ex.dias_sem ?? "-");
      case "restaurante": return "Brasa";
      default: return "-";
    }
  });
}

// Agora em São Paulo: dia da semana (0 = domingo) e "HH:MM".
export function agoraSP() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const w = p.find((x) => x.type === "weekday")?.value ?? "Sun";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(w);
  const hhmm = `${p.find((x) => x.type === "hour")?.value ?? "00"}:${p.find((x) => x.type === "minute")?.value ?? "00"}`;
  return { dow, hhmm };
}
export const dentroDaJanela = (ini: string, fim: string, hhmm: string) => (ini <= fim ? hhmm >= ini && hhmm < fim : hhmm >= ini || hhmm < fim);

function inicioDoDiaSP() {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${hoje}T00:00:00-03:00`).toISOString();
}

// ------------------------------------------------------------------ motor
type Admin = ReturnType<typeof createAdminClient>;
const POR_RODADA = 60;

async function enviarUm(admin: Admin, envioId: string, telefone: string, modelo: string, idioma: string, params: string[], imagem: string | null) {
  const r = await enviarModeloWpp(telefone, modelo, idioma, params, imagem);
  await admin.from("wpp_envios").update(r.ok
    ? { status: "enviada", wa_id: r.waId, params, enviado_em: new Date().toISOString(), erro: null }
    : { status: "falha", params, erro: r.erro.slice(0, 300), enviado_em: new Date().toISOString() },
  ).eq("id", envioId);
  return r.ok;
}

export async function rodarDisparos() {
  if (!whatsappConfigurado()) return { ok: false as const, motivo: "WhatsApp não configurado" };
  const admin = createAdminClient();
  const { data: cfgs } = await admin.from("wpp_config").select("*");
  const { dow, hhmm } = agoraSP();
  const resumo: Record<string, number> = { gatilhos: 0, campanhas: 0, falhas: 0 };

  for (const cfg of (cfgs ?? []) as { empresa_id: string; limite_dia: number; intervalo_auto_dias: number; auto_hora_ini: string; auto_hora_fim: string }[]) {
    const emp = cfg.empresa_id;
    const { count: hoje } = await admin.from("wpp_envios").select("id", { count: "exact", head: true })
      .eq("empresa_id", emp).in("status", ["enviada", "entregue", "lida"]).gte("enviado_em", inicioDoDiaSP());
    let restante = Math.min(POR_RODADA, Math.max(0, cfg.limite_dia - (hoje ?? 0)));

    // ---------- gatilhos (primeiro: são respostas a algo que o cliente fez)
    if (restante > 0 && dentroDaJanela(cfg.auto_hora_ini, cfg.auto_hora_fim, hhmm)) {
      const { data: gats } = await admin.from("wpp_gatilhos").select("*").eq("empresa_id", emp).eq("ativo", true).not("modelo", "is", null);
      const ordem = GATILHOS.map((g) => g.chave);
      const lista = ((gats ?? []) as { chave: string; modelo: string; idioma: string; variaveis: string[]; dias: number | null; cupom: string | null; imagem_url: string | null }[])
        .sort((a, b) => ordem.indexOf(a.chave) - ordem.indexOf(b.chave));
      for (const g of lista) {
        if (restante <= 0) break;
        const { data: cands } = await admin.rpc("wpp_candidatos", { p_empresa: emp, p_chave: g.chave, p_dias: g.dias ?? GATILHOS.find((x) => x.chave === g.chave)?.dias?.padrao ?? 0, p_intervalo: cfg.intervalo_auto_dias });
        for (const c of ((cands ?? []) as { cliente_id: string; nome: string; telefone: string; ref: string; extra: Record<string, unknown> | null }[])) {
          if (restante <= 0) break;
          const { data: novo } = await admin.from("wpp_envios").insert({
            empresa_id: emp, gatilho: g.chave, ref: c.ref, cliente_id: c.cliente_id, telefone: c.telefone, nome: c.nome, modelo: g.modelo, status: "fila",
          }).select("id").maybeSingle();
          if (!novo) continue; // já existia (outra rodada pegou)
          let saldo: number | null = null;
          if (g.variaveis.includes("cashback_saldo")) {
            const { data: s } = await admin.rpc("cashback_saldo", { p_cliente: c.cliente_id });
            saldo = Number(s ?? 0);
          }
          const params = resolverVariaveis(g.variaveis, { nome: c.nome, link: linkCardapio({ cupom: g.cupom }), cupom: g.cupom, extra: c.extra, saldo });
          const ok = await enviarUm(admin, (novo as { id: string }).id, c.telefone, g.modelo, g.idioma, params, g.imagem_url);
          restante--;
          if (ok) resumo.gatilhos++; else resumo.falhas++;
        }
      }
    }

    // ---------- campanhas
    const { data: camps } = await admin.from("wpp_campanhas").select("*").eq("empresa_id", emp).in("status", ["agendada", "enviando"]).order("lancada_em");
    for (const c of (camps ?? []) as {
      id: string; publico: { tipo?: string; dias?: number; min?: number }; dias: number[]; hora_ini: string; hora_fim: string;
      cupom: string | null; modelo: string; idioma: string; variaveis: string[]; imagem_url: string | null; montada_em: string | null;
    }[]) {
      if (!c.dias.includes(dow) || !dentroDaJanela(c.hora_ini, c.hora_fim, hhmm)) continue;
      if (!c.montada_em) {
        // Monta a lista de quem recebe (uma vez, na primeira janela).
        const { data: pub } = await admin.rpc("wpp_publico", { p_empresa: emp, p_tipo: c.publico?.tipo ?? "todos", p_dias: c.publico?.dias ?? null, p_min: c.publico?.min ?? null });
        const linhas = ((pub ?? []) as { cliente_id: string; nome: string; telefone: string }[]).map((p) => ({
          empresa_id: emp, campanha_id: c.id, cliente_id: p.cliente_id, telefone: p.telefone, nome: p.nome, modelo: c.modelo, status: "fila",
        }));
        // Índice único (campanha, cliente): se uma rodada anterior caiu no meio, o
        // lote repetido só falha e segue — ninguém recebe duas vezes.
        for (let i = 0; i < linhas.length; i += 500) await admin.from("wpp_envios").insert(linhas.slice(i, i + 500));
        await admin.from("wpp_campanhas").update({ montada_em: new Date().toISOString(), total_clientes: linhas.length, status: "enviando" }).eq("id", c.id);
      }
      if (restante <= 0) continue;
      const { data: fila } = await admin.from("wpp_envios").select("id, cliente_id, telefone, nome").eq("campanha_id", c.id).eq("status", "fila").limit(restante);
      const link = linkCardapio({ campanhaId: c.id, cupom: c.cupom });
      for (const e of (fila ?? []) as { id: string; cliente_id: string | null; telefone: string; nome: string | null }[]) {
        let saldo: number | null = null;
        if (c.variaveis.includes("cashback_saldo") && e.cliente_id) {
          const { data: s } = await admin.rpc("cashback_saldo", { p_cliente: e.cliente_id });
          saldo = Number(s ?? 0);
        }
        const params = resolverVariaveis(c.variaveis, { nome: e.nome, link, cupom: c.cupom, saldo });
        const ok = await enviarUm(admin, e.id, e.telefone, c.modelo, c.idioma, params, c.imagem_url);
        restante--;
        if (ok) resumo.campanhas++; else resumo.falhas++;
      }
      const { count: faltam } = await admin.from("wpp_envios").select("id", { count: "exact", head: true }).eq("campanha_id", c.id).eq("status", "fila");
      if ((faltam ?? 0) === 0) await admin.from("wpp_campanhas").update({ status: "concluida", concluida_em: new Date().toISOString() }).eq("id", c.id);
    }
  }
  return { ok: true as const, ...resumo };
}
