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
  nomeConvenio: string; horaLimite: string; horaEntrega: string; bloquearAposLimite: boolean;
  filiais: string[]; usuarios: { id: string; nome: string; senha: string; permissoes: string[] }[];
  colaboradores: { id: string; nome: string; matricula?: string }[];
  cardapios: { semanas: { id: string; nome: string; dias: Record<string, { pratos: string[]; proteinas: string[]; salada: string }> }[]; ativo: string | null };
};

async function getCfg(db: Db): Promise<Cfg> {
  const { data } = await db.from("mkt_config").select("chave, valor");
  const m: Record<string, string> = {};
  for (const row of data || []) m[row.chave] = row.valor;
  const cardapios = parseObj<Cfg["cardapios"]>(m.cardapios, { semanas: semanasVazias(), ativo: null });
  if (!Array.isArray(cardapios.semanas) || cardapios.semanas.length !== 4) cardapios.semanas = semanasVazias();
  return {
    nomeConvenio: m.nomeConvenio ?? "Kern",
    horaLimite: m.horaLimite ?? "10:00",
    horaEntrega: m.horaEntrega ?? "12:00",
    bloquearAposLimite: (m.bloquearAposLimite ?? "1") === "1",
    filiais: parseLista(m.filiais).length ? parseLista(m.filiais) : ["Filial 1", "Filial 2", "Filial 3"],
    usuarios: parseLista(m.usuarios) as unknown as Cfg["usuarios"],
    colaboradores: parseLista(m.colaboradores) as unknown as Cfg["colaboradores"],
    cardapios,
  };
}
async function setCfg(db: Db, chave: string, valor: unknown) {
  await db.from("mkt_config").upsert({ chave, valor: String(valor) });
}
function configPublica(cfg: Cfg) {
  return { nomeConvenio: cfg.nomeConvenio, horaLimite: cfg.horaLimite, horaEntrega: cfg.horaEntrega, bloquearAposLimite: cfg.bloquearAposLimite, filiais: cfg.filiais, precisaLogin: cfg.usuarios.length > 0 };
}
function resolveCardapioHoje(cfg: Cfg, data: string) {
  const sem = cfg.cardapios.semanas.find((s) => s.id === cfg.cardapios.ativo);
  const dia = sem && sem.dias ? sem.dias[diaSemana(data)] : null;
  return dia ? { pratos: dia.pratos || [], proteinas: dia.proteinas || [], salada: dia.salada || "" } : { pratos: [], proteinas: [], salada: "" };
}
async function resolveUsuario(cfg: Cfg, req: NextRequest) {
  if (cfg.usuarios.length === 0) return { nome: "Administrador", permissoes: PERMISSOES.slice() };
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
  await db.from("mkt_pedidos").insert({ id, data, filial: p.filial, colaborador_id: p.colaboradorId || null, cliente: p.cliente, matricula: p.matricula, pratos: JSON.stringify(p.pratos), proteina: p.proteina, salada: p.salada, origem: p.origem, criado_em: criadoEm });
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
    const data = agoraBR().data;
    const { data: ped } = await db.from("mkt_pedidos").select("colaborador_id").eq("data", data);
    const jaPediram = new Set((ped || []).map((x) => x.colaborador_id).filter(Boolean));
    const disponiveis = cfg.colaboradores.filter((c) => !jaPediram.has(c.id));
    const ag = agoraBR();
    const aberto = !cfg.bloquearAposLimite || ag.hora <= cfg.horaLimite;
    return json({ nomeConvenio: cfg.nomeConvenio, filiais: cfg.filiais, horaLimite: cfg.horaLimite, horaEntrega: cfg.horaEntrega, data, aberto, cardapioHoje: resolveCardapioHoje(cfg, data), colaboradores: disponiveis });
  }
  if (path === "/api/publico/pedido" && method === "POST") {
    const data = agoraBR().data;
    const ag = agoraBR();
    if (cfg.bloquearAposLimite && ag.hora > cfg.horaLimite) return erro("Os pedidos de hoje ja encerraram (apos " + cfg.horaLimite + ").", 403);
    const p = pedidoDoBody(body || {}, "colaborador");
    if (!p.colaboradorId) return erro("Selecione seu nome na lista");
    const colab = cfg.colaboradores.find((c) => c.id === p.colaboradorId);
    if (!colab) return erro("Colaborador nao encontrado");
    p.cliente = colab.nome; p.matricula = colab.matricula || "";
    const v = validaPedido(p); if (v) return erro(v);
    if (await jaPediu(db, data, p.colaboradorId)) return erro("Voce ja fez seu pedido hoje.", 409);
    return json(await inserePedido(db, data, p), 201);
  }

  // ===== LOGIN =====
  if (path === "/api/login" && method === "POST") {
    if (cfg.usuarios.length === 0) return json({ ok: true, nome: "Administrador", permissoes: PERMISSOES.slice() });
    const u = cfg.usuarios.find((x) => x.senha === String(body?.senha || "") && x.senha !== "");
    if (u) return json({ ok: true, nome: u.nome, permissoes: u.permissoes || [] });
    if (await erpDono()) return json({ ok: true, nome: "Administrador", permissoes: PERMISSOES.slice() });
    return json({ ok: false });
  }
  if (path === "/api/config" && method === "GET") return json(configPublica(cfg));

  // A partir daqui exige usuário
  const user = await resolveUsuario(cfg, req);
  if (!user) return erro("Acesso negado.", 401);

  if (path === "/api/config" && method === "POST") {
    if (!pode(user, "ajustes")) return erro("Sem permissao (ajustes).", 403);
    if (body?.nomeConvenio != null) await setCfg(db, "nomeConvenio", body.nomeConvenio);
    if (body?.horaLimite != null) await setCfg(db, "horaLimite", body.horaLimite);
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
    if (method === "GET") return json(cfg.cardapios);
    if (method === "POST") {
      const semanas = Array.isArray(body?.semanas) ? (body.semanas as Cfg["cardapios"]["semanas"]) : cfg.cardapios.semanas;
      const ativo = (body?.ativo as string) ?? cfg.cardapios.ativo;
      const limpo = semanas.slice(0, 4).map((s, idx) => {
        const dias: Record<string, { pratos: string[]; proteinas: string[]; salada: string }> = {};
        for (const dk of ["seg", "ter", "qua", "qui", "sex", "sab"]) {
          const d = (s.dias && s.dias[dk]) || { pratos: [], proteinas: [], salada: "" };
          dias[dk] = { pratos: limpaLista(d.pratos, 5), proteinas: limpaLista(d.proteinas, 2), salada: String(d.salada || "").trim() };
        }
        return { id: s.id || "s" + (idx + 1), nome: String(s.nome || "Semana " + (idx + 1)).trim(), dias };
      });
      await setCfg(db, "cardapios", JSON.stringify({ semanas: limpo, ativo }));
      return json({ ok: true, ativo });
    }
  }

  if (path === "/api/cardapio" && method === "GET") {
    const data = url.searchParams.get("data") || agoraBR().data;
    return json(resolveCardapioHoje(cfg, data));
  }

  if (path === "/api/pedidos") {
    if (method === "GET") {
      const data = url.searchParams.get("data") || agoraBR().data;
      const { data: rows } = await db.from("mkt_pedidos").select("*").eq("data", data).order("criado_em");
      return json(((rows as Row[]) || []).map(saidaPedido));
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
