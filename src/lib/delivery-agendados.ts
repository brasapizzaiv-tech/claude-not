// Pedido AGENDADO não imprime ao aceitar (o papel ficaria horas na bancada).
// Regra do Rafael (27/11/2026): os agendados de cada turno ficam guardados até
// a hora de liberar — almoço 10:30, noite 18:00 —, aí imprime tudo de uma vez;
// depois dessa hora, o agendado do turno imprime na hora em que entra.
// A rotina /api/delivery/agendados (de 5 em 5 min) solta os guardados; quem
// aceita/cria o pedido chama imprimirAgendadoSeLiberado pra sair na hora.
// Convênio (Kern) fica de fora: as marmitas saem por etiqueta.
// As horas podem ser trocadas em delivery_config.config.imprimirAgendados
// ({ almoco: "10:30", noite: "18:00" }).
import { imprimirComandaDoPedido, type Db } from "@/lib/delivery-core";

export const LIBERA_PADRAO = { almoco: "10:30", noite: "18:00" };
type Libera = typeof LIBERA_PADRAO;
// Divisa dos turnos (a mesma de delivery_turnos): antes das 16h é almoço.
const DIVISA_HORA = 16;
const SP_MS = 3 * 3600 * 1000; // America/Sao_Paulo, sem horário de verão
// Agendado que já passou faz tempo (pedido esquecido) não imprime do nada.
const ATRASO_MAX_MIN = 120;

const hhmmOk = (v: unknown): v is string => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);

export function lerLibera(config: unknown): Libera {
  const c = (config && typeof config === "object" ? (config as { imprimirAgendados?: Partial<Libera> }).imprimirAgendados : null) ?? {};
  return { almoco: hhmmOk(c.almoco) ? c.almoco : LIBERA_PADRAO.almoco, noite: hhmmOk(c.noite) ? c.noite : LIBERA_PADRAO.noite };
}

/** Hora (UTC, ms) em que o agendado pode ir pra cozinha: a liberação do turno
 *  do horário marcado, no mesmo dia. */
export function liberacaoDoAgendado(agendadoIso: string, libera: Libera): number {
  const local = new Date(Date.parse(agendadoIso) - SP_MS);
  const dia = local.toISOString().slice(0, 10);
  const hora = local.getUTCHours() < DIVISA_HORA ? libera.almoco : libera.noite;
  return Date.parse(`${dia}T${hora}:00-03:00`);
}

export const agendadoLiberado = (agendadoIso: string, libera: Libera, agora = Date.now()) =>
  agora >= liberacaoDoAgendado(agendadoIso, libera);

async function liberaDaEmpresa(db: Db, empresaId: string | null): Promise<Libera> {
  let q = db.from("delivery_config").select("config").limit(1);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data } = await q.maybeSingle();
  return lerLibera((data as { config?: unknown } | null)?.config);
}

// Aceito → em preparo + imprime, uma vez só (dois caminhos ao mesmo tempo, ou
// alguém mudando no painel, não imprimem 2×).
async function soltarNaCozinha(db: Db, pedidoId: string) {
  const { data: pegou } = await db
    .from("delivery_pedidos")
    .update({ status: "em_preparo", preparo_em: new Date().toISOString() })
    .eq("id", pedidoId)
    .eq("status", "aceito")
    .select("id");
  if (!pegou || pegou.length === 0) return false;
  await imprimirComandaDoPedido(db, pedidoId);
  return true;
}

/** Chamado ao aceitar/criar: agendado de turno já liberado sai na hora. */
export async function imprimirAgendadoSeLiberado(db: Db, pedidoId: string): Promise<boolean> {
  const { data } = await db.from("delivery_pedidos").select("status, origem, agendado_para, empresa_id").eq("id", pedidoId).maybeSingle();
  const p = data as { status: string; origem: string; agendado_para: string | null; empresa_id: string | null } | null;
  if (!p?.agendado_para || p.status !== "aceito" || p.origem === "convenio") return false;
  if (!agendadoLiberado(p.agendado_para, await liberaDaEmpresa(db, p.empresa_id))) return false;
  try { return await soltarNaCozinha(db, pedidoId); } catch { return false; }
}

/** Rotina: solta os agendados guardados quando chega a hora do turno. */
export async function prepararAgendados(db: Db) {
  const { data: cfgs } = await db.from("delivery_config").select("empresa_id, config");
  const agora = Date.now();
  let impressos = 0;
  const erros: string[] = [];
  for (const cfg of (cfgs as { empresa_id: string | null; config: unknown }[]) ?? []) {
    if (!cfg.empresa_id) continue;
    const libera = lerLibera(cfg.config);
    const desde = new Date(agora - ATRASO_MAX_MIN * 60000).toISOString();
    // Só até amanhã: o resto ainda nem chegou no dia.
    const ate = new Date(agora + 30 * 3600 * 1000).toISOString();
    const { data: peds } = await db
      .from("delivery_pedidos")
      .select("id, agendado_para")
      .eq("empresa_id", cfg.empresa_id)
      .eq("status", "aceito")
      .neq("origem", "convenio")
      .not("agendado_para", "is", null)
      .gte("agendado_para", desde)
      .lte("agendado_para", ate)
      .limit(100);
    for (const p of (peds as { id: string; agendado_para: string }[]) ?? []) {
      if (!agendadoLiberado(p.agendado_para, libera, agora)) continue;
      try {
        if (await soltarNaCozinha(db, p.id)) impressos++;
      } catch (e) {
        erros.push(`${p.id}: ${e instanceof Error ? e.message : "falha ao imprimir"}`);
      }
    }
  }
  return { impressos, erros };
}
