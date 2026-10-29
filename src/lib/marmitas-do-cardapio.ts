// Marmitas do delivery puxam o cardápio do dia (migrations 0264/0265).
// Cada grupo de escolha marcado com cardapio_fonte (proteinas/carboidratos) e
// cardapio_marmita (tradicional/dia/premium) recebe como opções os pratos do
// cardápio publicado do dia que estão marcados pra aquela marmita (do lado de
// cada prato, no editor do cardápio; regra em marmitas-marcas.ts). Opção que
// já existia pelo nome é reaproveitada (mesmo id, mesmo preço); a que saiu do
// dia é desligada (não apagada). Roda ao salvar/publicar o cardápio de hoje e,
// no 1º acesso do dia ao app/delivery, pelo garantirMarmitasDeHoje.
import type { createAdminClient } from "@/lib/supabase/admin";
import { marcasDoDia, type Marmitas, type QualMarmita } from "@/lib/marmitas-marcas";
import { kernDoDia } from "@/lib/marmitas-cardapio";

type Db = ReturnType<typeof createAdminClient>;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const linhas = (t: string | null | undefined) => (t ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
export const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dowDe = (iso: string) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };

// empresaId: obrigatório com o cliente admin (aí o banco não filtra sozinho).
export async function sincronizarMarmitas(db: Db, data: string, empresaId?: string | null) {
  let qc = db.from("cardapio_dia").select("proteinas, carboidratos, marmitas, publicado").eq("data", data);
  if (empresaId) qc = qc.eq("empresa_id", empresaId);
  const { data: row } = await qc.maybeSingle();
  const c = row as { proteinas: string | null; carboidratos: string | null; marmitas: Marmitas | null; publicado: boolean } | null;
  if (!c || !c.publicado) return { ok: false as const, motivo: "sem cardápio publicado" };
  const dia = { proteinas: linhas(c.proteinas), carboidratos: linhas(c.carboidratos) };
  const marcas = marcasDoDia(c.marmitas, [...dia.proteinas, ...dia.carboidratos], dowDe(data));

  let qg = db.from("pdv_item_grupos").select("id, empresa_id, cardapio_fonte, cardapio_marmita").not("cardapio_fonte", "is", null).not("cardapio_marmita", "is", null);
  if (empresaId) qg = qg.eq("empresa_id", empresaId);
  const { data: gs } = await qg;
  const dow = dowDe(data);
  // Salada do dia das marmitas do convênio (a mesma pra todas; lida uma vez).
  let salada: string | null | undefined;
  const saladaConvenio = async () => {
    if (salada === undefined) salada = (await kernDoDia(data).catch(() => null))?.salada?.trim() || null;
    return salada;
  };
  for (const g of (gs as { id: string; empresa_id: string; cardapio_fonte: "proteinas" | "carboidratos" | "todos" | "salada"; cardapio_marmita: QualMarmita }[] | null) ?? []) {
    if (g.cardapio_fonte === "salada") { await sincronizarSalada(db, g.id, await saladaConvenio()); continue; }
    if (g.cardapio_fonte === "todos") { await sincronizarAdicionais(db, g.id, g.cardapio_marmita === "premium" && dow !== 6 ? [] : [...dia.proteinas, ...dia.carboidratos]); continue; }
    // Dia que ninguém marcou ainda: a Marmita do Dia fica como estava (não
    // trava o pedido); Tradicional e Premium seguem o padrão (tudo).
    if (!c.marmitas && g.cardapio_marmita === "dia") continue;
    const vai = new Set(marcas[g.cardapio_marmita].map(norm));
    // Marmita sem nada marcado fica sem opção (não dá pra pedir) em vez de
    // vender o prato de outro dia; o editor mostra quantos estão marcados.
    const queremos = dia[g.cardapio_fonte].filter((n) => vai.has(norm(n)));
    const { data: ops } = await db.from("pdv_item_opcoes").select("id, nome, ativo").eq("grupo_id", g.id);
    const existentes = new Map(((ops as { id: string; nome: string; ativo: boolean }[] | null) ?? []).map((o) => [norm(o.nome), o]));
    const usados = new Set<string>();
    for (const [ordem, nome] of queremos.entries()) {
      const ja = existentes.get(norm(nome));
      if (ja) { usados.add(ja.id); await db.from("pdv_item_opcoes").update({ ativo: true, ordem, nome }).eq("id", ja.id); }
      else await db.from("pdv_item_opcoes").insert({ grupo_id: g.id, empresa_id: g.empresa_id, nome, preco: 0, ativo: true, ordem });
    }
    const desligar = [...existentes.values()].filter((o) => o.ativo && !usados.has(o.id)).map((o) => o.id);
    if (desligar.length) await db.from("pdv_item_opcoes").update({ ativo: false }).in("id", desligar);
  }
  return { ok: true as const };
}

// Adicionais (cardapio_fonte "todos"): todos os pratos do dia, cada um com o
// preço que já tem na lista do grupo. Prato sem preço fica desligado (não sai
// de graça) — o editor do cardápio mostra quais faltam (adicionaisSemPreco).
async function sincronizarAdicionais(db: Db, grupoId: string, pratos: string[]) {
  const { data: ops } = await db.from("pdv_item_opcoes").select("id, nome, preco, ativo").eq("grupo_id", grupoId);
  const lista = (ops as { id: string; nome: string; preco: number; ativo: boolean }[] | null) ?? [];
  const existentes = new Map(lista.map((o) => [norm(o.nome), o]));
  const { data: g } = await db.from("pdv_item_grupos").select("empresa_id").eq("id", grupoId).single();
  const usados = new Set<string>();
  for (const [ordem, nome] of pratos.entries()) {
    const ja = existentes.get(norm(nome));
    if (ja) { usados.add(ja.id); await db.from("pdv_item_opcoes").update({ ativo: Number(ja.preco) > 0, ordem }).eq("id", ja.id); }
    else await db.from("pdv_item_opcoes").insert({ grupo_id: grupoId, empresa_id: (g as { empresa_id: string } | null)?.empresa_id, nome, preco: 0, ativo: false, ordem });
  }
  const desligar = lista.filter((o) => o.ativo && !usados.has(o.id)).map((o) => o.id);
  if (desligar.length) await db.from("pdv_item_opcoes").update({ ativo: false }).in("id", desligar);
}

// "Deseja salada?": uma opção só, com a salada do convênio do dia. Sem salada
// cadastrada pro dia (domingo, feriado), fica como estava.
async function sincronizarSalada(db: Db, grupoId: string, salada: string | null) {
  if (!salada) return;
  const nome = `SALADA: ${salada}`;
  const { data: ops } = await db.from("pdv_item_opcoes").select("id").eq("grupo_id", grupoId).order("ordem");
  const lista = (ops as { id: string }[] | null) ?? [];
  if (lista.length) await db.from("pdv_item_opcoes").update({ nome, ativo: true, ordem: 0 }).eq("id", lista[0].id);
  else {
    const { data: g } = await db.from("pdv_item_grupos").select("empresa_id").eq("id", grupoId).single();
    await db.from("pdv_item_opcoes").insert({ grupo_id: grupoId, empresa_id: (g as { empresa_id: string } | null)?.empresa_id, nome, preco: 0, ativo: true, ordem: 0 });
  }
  if (lista.length > 1) await db.from("pdv_item_opcoes").update({ ativo: false }).in("id", lista.slice(1).map((o) => o.id));
}

/** Prato novo em qualquer dia salvo já aparece (desligado, sem preço) nos
 *  Adicionais das marmitas, pra dar o preço antes do dia chegar. */
export async function prepararAdicionais(db: Db, pratos: string[]) {
  const { data: gs } = await db.from("pdv_item_grupos").select("id, empresa_id").eq("cardapio_fonte", "todos");
  for (const g of (gs as { id: string; empresa_id: string }[] | null) ?? []) {
    const { data: ops } = await db.from("pdv_item_opcoes").select("nome").eq("grupo_id", g.id);
    const tem = new Set(((ops as { nome: string }[] | null) ?? []).map((o) => norm(o.nome)));
    const novos = [...new Set(pratos)].filter((p) => !tem.has(norm(p)));
    if (novos.length) await db.from("pdv_item_opcoes").insert(novos.map((nome) => ({ grupo_id: g.id, empresa_id: g.empresa_id, nome, preco: 0, ativo: false, ordem: 999 })));
  }
}

/** Nomes (sem acento/caixa) com preço nos Adicionais de cada marmita — o editor
 *  do cardápio avisa qual prato do dia ficou sem preço de adicional. */
export async function pratosComPrecoAdicional(db: Db) {
  const { data: gs } = await db.from("pdv_item_grupos").select("id, cardapio_marmita").eq("cardapio_fonte", "todos");
  const out: Partial<Record<QualMarmita, string[]>> = {};
  for (const g of (gs as { id: string; cardapio_marmita: QualMarmita }[] | null) ?? []) {
    const { data: ops } = await db.from("pdv_item_opcoes").select("nome").eq("grupo_id", g.id).gt("preco", 0);
    out[g.cardapio_marmita] = ((ops as { nome: string }[] | null) ?? []).map((o) => norm(o.nome));
  }
  return out;
}
export const normPrato = norm;

// Uma vez por dia (o 1º que abrir o app do cliente ou o Novo pedido).
export async function garantirMarmitasDeHoje(db: Db, empresaId: string) {
  const hoje = hojeSP();
  const { data: cfg } = await db.from("pdv_config").select("valor").eq("empresa_id", empresaId).eq("chave", "marmitas_cardapio_dia").maybeSingle();
  if ((cfg as { valor: string } | null)?.valor === hoje) return;
  const r = await sincronizarMarmitas(db, hoje, empresaId);
  if (r.ok) await db.from("pdv_config").upsert({ empresa_id: empresaId, chave: "marmitas_cardapio_dia", valor: hoje }, { onConflict: "empresa_id,chave" });
}
