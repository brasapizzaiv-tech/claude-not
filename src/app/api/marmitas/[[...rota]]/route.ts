import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Login unificado: quem está logado no ERP como "dono" é admin das marmitas.
async function erpDono(): Promise<boolean> {
  try {
    const supa = await createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return false;
    const { data } = await supa.from("profiles").select("papel").eq("id", user.id).single();
    return data?.papel === "dono";
  } catch {
    return false;
  }
}

// Sistema de Marmitas portado do Worker Cloudflare para Next.js + Supabase.
// Mantém o mesmo contrato de API e a mesma autenticação (cabeçalho X-Senha).

type Db = ReturnType<typeof createAdminClient>;

const PERMISSOES = ["pedidos_add", "pedidos_edit", "cardapio", "relatorio", "colaboradores", "ajustes", "usuarios"];
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const MAX_PRATOS = 4;

const json = (o: unknown, s = 200) => NextResponse.json(o, { status: s });
const erro = (m: string, s = 400) => NextResponse.json({ erro: m }, { status: s });

function agoraBR() {
  const t = new Date(Date.now() - 3 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return { data: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`, hora: `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}` };
}
function diaSemana(data: string) { const [y, m, d] = data.split("-").map(Number); return DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; }
function parseLista(v: unknown): string[] { try { const a = JSON.parse((v as string) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } }
function normSalada(v: unknown) { if (v == null) return ""; if (typeof v === "string") return v && v !== "0" ? v : ""; if (v === 1 || v === true) return "Salada"; return ""; }
function parseObj<T>(v: unknown, def: T): T { try { const o = JSON.parse((v as string) || "null"); return o && typeof o === "object" ? o : def; } catch { return def; } }
function novoId() { return crypto.randomUUID().replace(/-/g, "").slice(0, 10); }
function limpaLista(v: unknown, max: number): string[] { const a = (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean); return max ? a.slice(0, max) : a; }

function semanasVazias() {
  const diaVazio = () => ({ pratos: [], proteinas: [], salada: "" });
  const dias = () => ({ seg: diaVazio(), ter: diaVazio(), qua: diaVazio(), qui: diaVazio(), sex: diaVazio(), sab: diaVazio() });
  return [1, 2, 3, 4].map((n) => ({ id: "s" + n, nome: "Semana " + n, dias: dias() }));
}

type Cfg = {
  nomeConvenio: string; horaLimite: string; horaAbertura: string; horaEntrega: string; bloquearAposLimite: boolean;
  filiais: string[]; usuarios: { id: string; nome: string; senha: string; permissoes: string[] }[];
  colaboradores: { id: string; nome: string; matricula?: string }[];
  // Dias sem marmita (feriados): o app pula esses dias.
  bloqueios: { data: string; motivo: string }[];
  cardapios: {
    semanas: { id: string; nome: string; dias: Record<string, { pratos: string[]; proteinas: string[]; salada: string }> }[];
    ativo: string | null;
    // segunda-feira (YYYY-MM-DD) → id da semana que vale a partir dali
    programacao?: Record<string, string>;
  };
};

async function getCfg(db: Db): Promise<Cfg> {
  const { data } = await db.from("mkt_config").select("chave, valor");
  const m: Record<string, string> = {};
  for (const row of data || []) m[row.chave] = row.valor;
  const cardapios = parseObj<Cfg["cardapios"]>(m.cardapios, { semanas: semanasVazias(), ativo: null });
  if (!Array.isArray(cardapios.semanas) || cardapios.semanas.length !== 4) cardapios.semanas = semanasVazias();
  return {
    nomeConvenio: m.nomeConvenio ?? "Kern",
    horaLimite: m.horaLimite ?? "08:30",
    horaAbertura: m.horaAbertura ?? "14:00",
    horaEntrega: m.horaEntrega ?? "12:00",
    bloquearAposLimite: (m.bloquearAposLimite ?? "1") === "1",
    filiais: parseLista(m.filiais).length ? parseLista(m.filiais) : ["Filial 1", "Filial 2", "Filial 3"],
    usuarios: parseLista(m.usuarios) as unknown as Cfg["usuarios"],
    colaboradores: parseLista(m.colaboradores) as unknown as Cfg["colaboradores"],
    bloqueios: (parseLista(m.bloqueios) as unknown as { data?: string; motivo?: string }[])
      .filter((b) => b && typeof b.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.data))
      .map((b) => ({ data: b.data as string, motivo: String(b.motivo || "").trim() })),
    cardapios,
  };
}
function bloqueado(cfg: Cfg, data: string) {
  return cfg.bloqueios.find((b) => b.data === data) ?? null;
}
async function setCfg(db: Db, chave: string, valor: unknown) {
  await db.from("mkt_config").upsert({ chave, valor: String(valor) });
}
function configPublica(cfg: Cfg) {
  return { nomeConvenio: cfg.nomeConvenio, horaLimite: cfg.horaLimite, horaAbertura: cfg.horaAbertura, horaEntrega: cfg.horaEntrega, bloquearAposLimite: cfg.bloquearAposLimite, filiais: cfg.filiais, precisaLogin: cfg.usuarios.length > 0 };
}
function addDias(data: string, n: number) {
  const [y, m, d] = data.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  const p = (x: number) => String(x).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}
function segundaDe(data: string) {
  const [y, m, d] = data.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDias(data, dow === 0 ? -6 : 1 - dow);
}
const DIAS_NOME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function fmtDia(data: string) {
  const [y, m, d] = data.split("-").map(Number);
  return `${DIAS_NOME[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
// Qual semana do cadastro vale para uma data. A programação guarda, por
// segunda-feira, a semana escolhida; a partir da última programada a rotação
// segue sozinha (1→2→3→4→1). Sem programação, a "ativa" vale pra semana atual.
// Isso resolve o sábado às 14h: os pedidos de segunda já abrem com a semana
// seguinte, sem depender de alguém "ativar" na mão antes.
function semanaPara(cfg: Cfg, data: string) {
  const semanas = cfg.cardapios.semanas;
  if (!semanas.length) return null;
  const seg = segundaDe(data);
  let ancDesde: string | null = null;
  let ancId: string | null = null;
  for (const [desde, id] of Object.entries(cfg.cardapios.programacao || {})) {
    if (desde <= seg && (!ancDesde || desde > ancDesde)) { ancDesde = desde; ancId = id; }
  }
  if (!ancDesde) { ancDesde = segundaDe(agoraBR().data); ancId = cfg.cardapios.ativo; }
  const idx = semanas.findIndex((s) => s.id === ancId);
  if (idx < 0) return null;
  const dif = Math.round((Date.parse(seg + "T00:00:00Z") - Date.parse(ancDesde + "T00:00:00Z")) / (7 * 86400000));
  const n = semanas.length;
  return semanas[(((idx + dif) % n) + n) % n];
}
function resolveCardapioHoje(cfg: Cfg, data: string) {
  const sem = semanaPara(cfg, data);
  const dia = sem && sem.dias ? sem.dias[diaSemana(data)] : null;
  return dia ? { pratos: dia.pratos || [], proteinas: dia.proteinas || [], salada: dia.salada || "" } : { pratos: [], proteinas: [], salada: "" };
}
function temCardapio(cfg: Cfg, data: string) {
  const c = resolveCardapioHoje(cfg, data);
  return c.pratos.length > 0 || c.proteinas.length > 0;
}
// Dia sem entrega: domingo ou dia bloqueado (feriado). Um dia sem cardápio NÃO
// é pulado (antes era, e o pedido ia parar até uma semana à frente, com o
// cardápio velho daquele dia) — fica "aguardando cardápio".
function semEntrega(cfg: Cfg, data: string) {
  return diaSemana(data) === "dom" || !!bloqueado(cfg, data);
}
function proximoDiaEntrega(cfg: Cfg, data: string) {
  let d = data;
  for (let i = 0; i < 30 && semEntrega(cfg, d); i++) d = addDias(d, 1);
  return d;
}
// Janela de pedido: para o dia de ENTREGA D, os pedidos abrem às `horaAbertura`
// do último dia de entrega antes de D (sábado, no caso da segunda; ou a
// véspera do feriado) e fecham às `horaLimite` de D. Descobre para qual dia
// dá pra pedir agora e se está aberto.
function janelaPedido(cfg: Cfg, ag: { data: string; hora: string }) {
  // Ainda dá pra pedir para HOJE (abriu ontem, fecha hoje no limite)?
  if (!semEntrega(cfg, ag.data) && ag.hora <= cfg.horaLimite) {
    return { alvo: ag.data, aberto: true };
  }
  const alvo = proximoDiaEntrega(cfg, addDias(ag.data, 1));
  let vespera = addDias(alvo, -1);
  for (let i = 0; i < 30 && semEntrega(cfg, vespera); i++) vespera = addDias(vespera, -1);
  const aberto = ag.data > vespera || (ag.data === vespera && ag.hora >= cfg.horaAbertura);
  return { alvo, aberto };
}
// Itens do pedido que não estão no cardápio do dia (tela desatualizada).
function itensForaDoCardapio(card: { pratos: string[]; proteinas: string[] }, p: Pedido) {
  const n = (s: string) => s.trim().toLowerCase();
  const pratos = new Set(card.pratos.map(n));
  const prots = new Set(card.proteinas.map(n));
  const fora = p.pratos.filter((x) => !pratos.has(n(x)));
  if (p.proteina && !prots.has(n(p.proteina))) fora.push(p.proteina);
  return fora;
}
async function resolveUsuario(cfg: Cfg, req: NextRequest) {
  // Sem usuários cadastrados só o dono logado no ERP administra (antes qualquer
  // um virava administrador — e apagar o último usuário abria a API inteira).
  const senha = req.headers.get("x-senha") || "";
  const u = cfg.usuarios.find((x) => x.senha === senha && senha !== "");
  if (u) return { nome: u.nome, permissoes: u.permissoes || [] };
  if (await erpDono()) return { nome: "Administrador", permissoes: PERMISSOES.slice() };
  return null;
}
const pode = (u: { permissoes: string[] } | null, p: string) => !!(u && (u.permissoes || []).includes(p));

async function jaPediu(db: Db, data: string, colaboradorId: string) {
  if (!colaboradorId) return false;
  const { count } = await db.from("mkt_pedidos").select("id", { count: "exact", head: true }).eq("data", data).eq("colaborador_id", colaboradorId);
  return (count || 0) > 0;
}
function pedidoDoBody(body: Record<string, unknown>, origem: string) {
  return {
    filial: String(body.filial || "").trim(),
    colaboradorId: String(body.colaboradorId || "").trim(),
    cliente: String(body.cliente || "").trim(),
    matricula: String(body.matricula || "").trim(),
    pratos: limpaLista(body.pratos, 0),
    proteina: String(body.proteina || "").trim(),
    salada: typeof body.salada === "string" ? body.salada.trim() : body.salada ? "Salada" : "",
    origem,
  };
}
type Pedido = ReturnType<typeof pedidoDoBody>;
function validaPedido(p: Pedido) {
  if (!p.filial) return "Escolha a filial";
  if (!p.cliente) return "Informe o nome";
  if (p.pratos.length < 1) return "Escolha pelo menos 1 prato";
  if (p.pratos.length > MAX_PRATOS) return "No maximo " + MAX_PRATOS + " pratos";
  return null;
}
async function inserePedido(db: Db, data: string, p: Pedido) {
  const id = novoId();
  const criadoEm = new Date().toISOString().replace("T", " ").slice(0, 19);
  const { error } = await db.from("mkt_pedidos").insert({ id, data, filial: p.filial, colaborador_id: p.colaboradorId || null, cliente: p.cliente, matricula: p.matricula, pratos: JSON.stringify(p.pratos), proteina: p.proteina, salada: p.salada, origem: p.origem, criado_em: criadoEm });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return { id, data, filial: p.filial, colaboradorId: p.colaboradorId, cliente: p.cliente, matricula: p.matricula, pratos: p.pratos, proteina: p.proteina, salada: p.salada, origem: p.origem, criadoEm };
}
type Row = { id: string; data: string; filial: string; colaborador_id: string | null; cliente: string; matricula: string | null; pratos: string | null; proteina: string | null; salada: string | null; origem: string | null; criado_em: string | null };
function saidaPedido(row: Row) {
  return { id: row.id, data: row.data, filial: row.filial, colaboradorId: row.colaborador_id || "", cliente: row.cliente, matricula: row.matricula, pratos: parseLista(row.pratos), proteina: row.proteina || "", salada: normSalada(row.salada), origem: row.origem || "", criadoEm: row.criado_em };
}

async function handle(req: NextRequest, rota: string[]) {
  const db = createAdminClient();
  const path = "/api/" + (rota || []).join("/");
  const method = req.method;
  const url = req.nextUrl;
  let body: Record<string, unknown> | null = null;
  if (method === "POST" || method === "PUT") { try { body = await req.json(); } catch { body = null; } }

  const cfg = await getCfg(db);

  // ===== ÁREA PÚBLICA (colaborador, sem senha) =====
  if (path === "/api/publico" && method === "GET") {
    const ag = agoraBR();
    const { alvo, aberto: dentroJanela } = janelaPedido(cfg, ag);
    const { data: ped } = await db.from("mkt_pedidos").select("colaborador_id").eq("data", alvo);
    const jaPediram = new Set((ped || []).map((x) => x.colaborador_id).filter(Boolean));
    const disponiveis = cfg.colaboradores.filter((c) => !jaPediram.has(c.id));
    const aberto = !cfg.bloquearAposLimite || dentroJanela;
    const semCardapio = !temCardapio(cfg, alvo);
    // Feriados dos próximos 10 dias, pro aviso na tela do colaborador.
    const proximosBloqueios = cfg.bloqueios.filter((b) => b.data >= ag.data && b.data <= addDias(ag.data, 10)).sort((a, b) => (a.data < b.data ? -1 : 1));
    return json({ nomeConvenio: cfg.nomeConvenio, filiais: cfg.filiais, horaLimite: cfg.horaLimite, horaAbertura: cfg.horaAbertura, horaEntrega: cfg.horaEntrega, data: alvo, aberto, semCardapio, semana: semanaPara(cfg, alvo)?.nome ?? null, cardapioHoje: resolveCardapioHoje(cfg, alvo), colaboradores: disponiveis, proximosBloqueios });
  }
  if (path === "/api/publico/pedido" && method === "POST") {
    const ag = agoraBR();
    const { alvo: data, aberto: dentroJanela } = janelaPedido(cfg, ag);
    if (cfg.bloquearAposLimite && !dentroJanela) {
      const noIntervalo = ag.hora > cfg.horaLimite && ag.hora < cfg.horaAbertura;
      return erro(
        noIntervalo
          ? `Os pedidos para o próximo dia abrem às ${cfg.horaAbertura}.`
          : `Os pedidos já encerraram (até ${cfg.horaLimite} do dia da entrega).`,
        403,
      );
    }
    // A tela manda pra qual dia ela achava que era o pedido. Se a janela virou
    // enquanto a página ficou aberta (celular no bolso), recusa e manda
    // recarregar — antes gravava no dia seguinte com o cardápio do dia anterior.
    const dataTela = String(body?.data || "");
    if (dataTela && dataTela !== data) {
      return json({ erro: `O dia do pedido mudou: agora os pedidos são para ${fmtDia(data)}. A tela foi atualizada — monte seu pedido de novo.`, recarregar: true }, 409);
    }
    const card = resolveCardapioHoje(cfg, data);
    if (!card.pratos.length && !card.proteinas.length) {
      return json({ erro: `O cardápio de ${fmtDia(data)} ainda não foi publicado.`, recarregar: true }, 409);
    }
    const p = pedidoDoBody(body || {}, "colaborador");
    if (!p.colaboradorId) return erro("Selecione seu nome na lista");
    const colab = cfg.colaboradores.find((c) => c.id === p.colaboradorId);
    if (!colab) return erro("Colaborador nao encontrado");
    p.cliente = colab.nome; p.matricula = colab.matricula || "";
    const v = validaPedido(p); if (v) return erro(v);
    const fora = itensForaDoCardapio(card, p);
    if (fora.length) {
      return json({ erro: `O cardápio foi atualizado e "${fora[0]}" não está mais nele. A tela foi recarregada — monte seu pedido de novo.`, recarregar: true }, 409);
    }
    if (await jaPediu(db, data, p.colaboradorId)) return erro("Voce ja fez seu pedido hoje.", 409);
    try {
      return json(await inserePedido(db, data, p), 201);
    } catch (e) {
      // Dois toques ao mesmo tempo: o índice único segura o segundo.
      if ((e as { code?: string }).code === "23505") return erro("Voce ja fez seu pedido hoje.", 409);
      throw e;
    }
  }

  // ===== LOGIN =====
  if (path === "/api/login" && method === "POST") {
    const u = cfg.usuarios.find((x) => x.senha === String(body?.senha || "") && x.senha !== "");
    if (u) return json({ ok: true, nome: u.nome, permissoes: u.permissoes || [] });
    if (await erpDono()) return json({ ok: true, nome: "Administrador", permissoes: PERMISSOES.slice() });
    return json({ ok: false });
  }
  if (path === "/api/config" && method === "GET") return json(configPublica(cfg));

  // A partir daqui exige usuário
  const user = await resolveUsuario(cfg, req);
  if (!user) return erro("Acesso negado.", 401);

  // ===== IMPRESSÃO NA ELGIN (pelo agente de impressão) =====
  // Qual impressora está marcada pras marmitas na Central de Impressões.
  if (path === "/api/impressora" && method === "GET") {
    const { data: imp } = await db.from("impressoras").select("id, nome").eq("recebe_marmitas", true).eq("ativo", true).limit(1).maybeSingle();
    return json({ ok: !!imp, nome: imp?.nome ?? null });
  }
  // Manda os pedidos pra fila; o agente imprime uma etiqueta por pedido.
  if (path === "/api/imprimir" && method === "POST") {
    const ids = limpaLista(body?.ids, 500);
    if (!ids.length) return erro("Nada para imprimir");
    const { data: imp } = await db.from("impressoras").select("id, nome").eq("recebe_marmitas", true).eq("ativo", true).limit(1).maybeSingle();
    if (!imp) return erro("Nenhuma impressora marcada para as marmitas (Central de Impressões).");
    const { data: peds } = await db.from("mkt_pedidos").select("id").in("id", ids);
    const existem = new Set((peds || []).map((p) => p.id as string));
    const validos = ids.filter((id) => existem.has(id));
    if (!validos.length) return erro("Pedidos nao encontrados");
    const { error } = await db.from("impressao_fila").insert(validos.map((id) => ({ tipo: "marmita", ref_id: id, impressora_id: imp.id })));
    if (error) return erro("Falha ao enfileirar: " + error.message, 500);
    return json({ ok: true, quantidade: validos.length, impressora: imp.nome });
  }

  if (path === "/api/config" && method === "POST") {
    if (!pode(user, "ajustes")) return erro("Sem permissao (ajustes).", 403);
    if (body?.nomeConvenio != null) await setCfg(db, "nomeConvenio", body.nomeConvenio);
    if (body?.horaLimite != null) await setCfg(db, "horaLimite", body.horaLimite);
    if (body?.horaAbertura != null) await setCfg(db, "horaAbertura", body.horaAbertura);
    if (body?.horaEntrega != null) await setCfg(db, "horaEntrega", body.horaEntrega);
    if (body?.bloquearAposLimite != null) await setCfg(db, "bloquearAposLimite", body.bloquearAposLimite ? "1" : "0");
    if (Array.isArray(body?.filiais)) { const fs = limpaLista(body.filiais, 0); if (fs.length) await setCfg(db, "filiais", JSON.stringify(fs)); }
    return json({ ok: true });
  }

  if (path === "/api/usuarios") {
    if (!pode(user, "usuarios")) return erro("Sem permissao (usuarios).", 403);
    if (method === "GET") return json(cfg.usuarios.map((u) => ({ id: u.id, nome: u.nome, permissoes: u.permissoes || [] })));
    if (method === "POST") {
      const lista = cfg.usuarios.slice();
      const nome = String(body?.nome || "").trim();
      const senha = String(body?.senha || "").trim();
      const permissoes = (Array.isArray(body?.permissoes) ? body.permissoes : []).filter((p: string) => PERMISSOES.includes(p));
      if (!nome) return erro("Informe o nome do usuario");
      if (body?.id) {
        const i = lista.findIndex((u) => u.id === body.id);
        if (i < 0) return erro("Usuario nao encontrado");
        lista[i] = { ...lista[i], nome, permissoes, senha: senha || lista[i].senha };
      } else {
        if (!senha) return erro("Informe a senha do novo usuario");
        lista.push({ id: novoId(), nome, senha, permissoes });
      }
      await setCfg(db, "usuarios", JSON.stringify(lista));
      return json({ ok: true });
    }
    if (method === "DELETE") {
      const id = url.searchParams.get("id");
      await setCfg(db, "usuarios", JSON.stringify(cfg.usuarios.filter((u) => u.id !== id)));
      return json({ ok: true });
    }
  }

  if (path === "/api/colaboradores") {
    if (method === "GET") { if (!pode(user, "colaboradores") && !pode(user, "pedidos_add")) return erro("Sem permissao.", 403); return json(cfg.colaboradores); }
    if (!pode(user, "colaboradores")) return erro("Sem permissao (colaboradores).", 403);
    if (method === "POST") {
      const lista = cfg.colaboradores.slice();
      if (Array.isArray(body?.lote)) {
        for (const nome of (body.lote as unknown[]).map((x) => String(x).trim()).filter(Boolean)) lista.push({ id: novoId(), nome, matricula: "" });
      } else {
        const nome = String(body?.nome || "").trim();
        if (!nome) return erro("Informe o nome");
        const matricula = String(body?.matricula || "").trim();
        if (body?.id) { const i = lista.findIndex((c) => c.id === body.id); if (i < 0) return erro("Nao encontrado"); lista[i] = { ...lista[i], nome, matricula }; }
        else lista.push({ id: novoId(), nome, matricula });
      }
      await setCfg(db, "colaboradores", JSON.stringify(lista));
      return json({ ok: true });
    }
    if (method === "DELETE") {
      const id = url.searchParams.get("id");
      await setCfg(db, "colaboradores", JSON.stringify(cfg.colaboradores.filter((c) => c.id !== id)));
      return json({ ok: true });
    }
  }

  if (path === "/api/cardapios") {
    if (!pode(user, "cardapio")) return erro("Sem permissao (cardapio).", 403);
    const estaSeg = segundaDe(agoraBR().data);
    const proxSeg = addDias(estaSeg, 7);
    const infoSemana = (seg: string) => {
      const s = semanaPara(cfg, seg);
      return { inicio: seg, fim: addDias(seg, 5), id: s?.id ?? null, nome: s?.nome ?? null, programada: !!(cfg.cardapios.programacao || {})[seg] };
    };
    if (method === "GET") return json({ ...cfg.cardapios, programacao: cfg.cardapios.programacao || {}, estaSemana: infoSemana(estaSeg), proximaSemana: infoSemana(proxSeg) });
    if (method === "POST") {
      const semanas = Array.isArray(body?.semanas) ? (body.semanas as Cfg["cardapios"]["semanas"]) : cfg.cardapios.semanas;
      const limpo = semanas.slice(0, 4).map((s, idx) => {
        const dias: Record<string, { pratos: string[]; proteinas: string[]; salada: string }> = {};
        for (const dk of ["seg", "ter", "qua", "qui", "sex", "sab"]) {
          const d = (s.dias && s.dias[dk]) || { pratos: [], proteinas: [], salada: "" };
          dias[dk] = { pratos: limpaLista(d.pratos, 5), proteinas: limpaLista(d.proteinas, 2), salada: String(d.salada || "").trim() };
        }
        return { id: s.id || "s" + (idx + 1), nome: String(s.nome || "Semana " + (idx + 1)).trim(), dias };
      });
      const ids = new Set(limpo.map((s) => s.id));
      // Programação por segunda-feira (YYYY-MM-DD → id). Guarda só as últimas 12 semanas.
      const progIn = body?.programacao && typeof body.programacao === "object" ? (body.programacao as Record<string, unknown>) : cfg.cardapios.programacao || {};
      const programacao: Record<string, string> = {};
      for (const [k, v] of Object.entries(progIn)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && ids.has(String(v)) && k >= addDias(estaSeg, -84)) programacao[segundaDe(k)] = String(v);
      }
      // Compatibilidade com o "ativar semana" antigo (manda só `ativo`): vale pra esta semana.
      const ativoBody = typeof body?.ativo === "string" ? body.ativo : null;
      if (ativoBody && ids.has(ativoBody) && ativoBody !== cfg.cardapios.ativo && !(body?.programacao)) programacao[estaSeg] = ativoBody;
      // Sem programação nenhuma, fixa a semana atual pra rotação partir dela.
      if (!Object.keys(programacao).length && cfg.cardapios.ativo && ids.has(cfg.cardapios.ativo)) programacao[estaSeg] = cfg.cardapios.ativo;
      const cfgNovo: Cfg = { ...cfg, cardapios: { semanas: limpo, ativo: cfg.cardapios.ativo, programacao } };
      const ativo = semanaPara(cfgNovo, estaSeg)?.id ?? null;
      await setCfg(db, "cardapios", JSON.stringify({ semanas: limpo, ativo, programacao }));
      return json({ ok: true, ativo });
    }
  }

  if (path === "/api/cardapio" && method === "GET") {
    const data = url.searchParams.get("data") || agoraBR().data;
    return json({ ...resolveCardapioHoje(cfg, data), semana: semanaPara(cfg, data)?.nome ?? null, bloqueio: bloqueado(cfg, data)?.motivo ?? null, domingo: diaSemana(data) === "dom" });
  }

  // ===== DIAS SEM MARMITA (feriados) =====
  if (path === "/api/bloqueios") {
    if (method === "GET") return json(cfg.bloqueios.sort((a, b) => (a.data < b.data ? -1 : 1)));
    if (!pode(user, "ajustes") && !pode(user, "cardapio")) return erro("Sem permissao (ajustes ou cardapio).", 403);
    if (method === "POST") {
      const data = String(body?.data || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return erro("Informe a data");
      const motivo = String(body?.motivo || "").trim().slice(0, 60) || "Sem marmita";
      const lista = cfg.bloqueios.filter((b) => b.data !== data);
      lista.push({ data, motivo });
      await setCfg(db, "bloqueios", JSON.stringify(lista));
      return json({ ok: true });
    }
    if (method === "DELETE") {
      const data = url.searchParams.get("data") || "";
      await setCfg(db, "bloqueios", JSON.stringify(cfg.bloqueios.filter((b) => b.data !== data)));
      return json({ ok: true });
    }
  }

  if (path === "/api/pedidos") {
    if (method === "GET") {
      const data = url.searchParams.get("data") || agoraBR().data;
      const { data: rows } = await db.from("mkt_pedidos").select("*").eq("data", data);
      // Ordem alfabética pelo nome (facilita achar repetidos). Acentos tratados.
      const lista = ((rows as Row[]) || [])
        .map(saidaPedido)
        .sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR", { sensitivity: "base" }));
      return json(lista);
    }
    if (method === "POST") {
      if (!pode(user, "pedidos_add")) return erro("Sem permissao (lancar pedidos).", 403);
      const data = String(body?.data || agoraBR().data);
      const p = pedidoDoBody(body || {}, "buffet");
      const v = validaPedido(p); if (v) return erro(v);
      if (p.colaboradorId && (await jaPediu(db, data, p.colaboradorId))) return erro("Esse colaborador ja tem pedido neste dia.", 409);
      return json(await inserePedido(db, data, p), 201);
    }
    if (method === "PUT") {
      if (!pode(user, "pedidos_edit")) return erro("Sem permissao (editar pedidos).", 403);
      const id = url.searchParams.get("id") || (body?.id as string);
      if (!id) return erro("Informe o id");
      const p = pedidoDoBody(body || {}, (body?.origem as string) || "buffet");
      const v = validaPedido(p); if (v) return erro(v);
      await db.from("mkt_pedidos").update({ filial: p.filial, cliente: p.cliente, matricula: p.matricula, pratos: JSON.stringify(p.pratos), proteina: p.proteina, salada: p.salada }).eq("id", id);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      if (!pode(user, "pedidos_edit")) return erro("Sem permissao (remover pedidos).", 403);
      const id = url.searchParams.get("id");
      await db.from("mkt_pedidos").delete().eq("id", id ?? "");
      return json({ ok: true });
    }
  }

  if (path === "/api/relatorio" && method === "GET") {
    if (!pode(user, "relatorio")) return erro("Sem permissao (relatorio).", 403);
    let de = url.searchParams.get("de");
    let ate = url.searchParams.get("ate");
    const mes = url.searchParams.get("mes");
    if (mes && !de) { de = mes + "-01"; ate = mes + "-31"; }
    if (!de) de = agoraBR().data;
    if (!ate) ate = de;
    const { data: rows } = await db.from("mkt_pedidos").select("filial,cliente,matricula,pratos,proteina,salada").gte("data", de).lte("data", ate);
    const lst = (rows as Row[]) || [];
    const fMap = new Map<string, Map<string, { cliente: string; matricula: string; quantidade: number }>>();
    const cPratos: Record<string, number> = {}, cProt: Record<string, number> = {}, cSalada: Record<string, number> = {};
    for (const p of lst) {
      if (!fMap.has(p.filial)) fMap.set(p.filial, new Map());
      const pm = fMap.get(p.filial)!;
      const k = p.cliente + "||" + (p.matricula || "");
      if (!pm.has(k)) pm.set(k, { cliente: p.cliente, matricula: p.matricula || "", quantidade: 0 });
      pm.get(k)!.quantidade++;
      for (const pr of parseLista(p.pratos)) cPratos[pr] = (cPratos[pr] || 0) + 1;
      if (p.proteina) cProt[p.proteina] = (cProt[p.proteina] || 0) + 1;
      const sn = normSalada(p.salada); if (sn) cSalada[sn] = (cSalada[sn] || 0) + 1;
    }
    const porFilial = [...fMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([filial, pm]) => {
      const porPessoa = [...pm.values()].sort((a, b) => a.cliente.localeCompare(b.cliente));
      return { filial, quantidade: porPessoa.reduce((s, x) => s + x.quantidade, 0), porPessoa };
    });
    const lista = (o: Record<string, number>) => Object.entries(o).map(([nome, quantidade]) => ({ nome, quantidade })).sort((a, b) => b.quantidade - a.quantidade);
    return json({ de, ate, quantidadeTotal: lst.length, porFilial, consumo: { pratos: lista(cPratos), proteinas: lista(cProt), saladas: lista(cSalada) } });
  }

  return erro("Rota nao encontrada", 404);
}

type Ctx = { params: Promise<{ rota?: string[] }> };
async function run(req: NextRequest, ctx: Ctx) {
  try {
    const { rota } = await ctx.params;
    return await handle(req, rota || []);
  } catch (e) {
    return erro("Erro interno: " + (e instanceof Error ? e.message : String(e)), 500);
  }
}

export const GET = run;
export const POST = run;
export const PUT = run;
export const DELETE = run;
