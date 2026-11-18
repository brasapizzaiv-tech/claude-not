// Leitura dos pratos do cardápio pela IA (migration 0318). Só no servidor (usa
// a chave da Anthropic). Pra cada prato do catálogo guarda o ingrediente de
// destaque e o jeito de preparo; o cálculo de "repetido" fica em
// cardapio-conflitos.ts. Quem corrigiu à mão (analise_por ≠ 'ia') não é
// sobrescrito.
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarErro } from "@/lib/saude";
import { GRUPOS, linhas, type Db, type Grupo } from "@/lib/cardapio-dia-core";
import { PREPAROS, chavePrato, conflitosDoDia, type Analise, type Conflito } from "@/lib/cardapio-conflitos";

const MODELO = "claude-opus-5-5";
const LOTE = 50;
// US$ por milhão de tokens (Opus 5.5).
const PRECO = { entrada: 4, saida: 20 };

export const iaConfigurada = () => !!process.env.ANTHROPIC_API_KEY;

const INSTRUCOES = `Você ajuda a cozinha de um restaurante de buffet no Rio Grande do Sul (Brasil) a não repetir ingrediente no cardápio do dia.
Para cada prato da lista, diga:
1. "destaques": de 0 a 3 ingredientes que dão IDENTIDADE ao prato — o que o cliente olha e diz "isso é prato de ___". Use o nome comum, minúsculo, no singular, sem artigo nem preparo (ex.: "berinjela", "abobrinha", "brócolis", "couve-flor", "cenoura", "abóbora", "aipim", "banana", "palmito", "cogumelo", "espinafre", "ervilha", "milho", "peixe", "camarão", "salmão", "calabresa", "bacon", "lentilha", "grão-de-bico", "repolho", "chuchu", "vagem", "beterraba", "pimentão", "morango", "coco", "abacaxi").
   - Sinônimos sempre com o mesmo nome: mandioca/macaxeira/aipim → "aipim"; linguiça calabresa → "calabresa"; abobrinha italiana → "abobrinha"; qualquer peixe branco (tilápia, merluza, pescada) → "peixe".
   - Pense no que vai dentro de pratos conhecidos: ratatouille leva berinjela, abobrinha e pimentão; caponata leva berinjela; mandiocada e escondidinho de aipim levam aipim; arroz à grega leva cenoura, ervilha e milho; salpicão leva frango e batata palha (destaque nenhum além disso).
   - NÃO coloque as bases que o buffet repete todo dia de propósito: frango, carne bovina, carne de porco, camarão, arroz, feijão, batata, massa/macarrão, polenta, ovo, queijo, presunto, cebola, alho, tomate, molho de tomate, creme de leite/nata, leite, farinha, pão, manteiga.
   - Mistura de legumes sem um legume principal não tem destaque: "Legumes na manteiga", "Seleta de legumes", "Legumes salteados", "Arroz colorido", "Arroz à grega", recheio de bife à rolê → destaques []. Só conta o legume que dá o nome ou a cara do prato ("Cenoura glaceada" → ["cenoura"]). Ex.: "Frango grelhado", "Arroz branco", "Feijão", "Massa caseira", "Batata frita", "Bife acebolado" → destaques [].
2. "preparo": o jeito de fazer, SÓ quando é marcante e não deveria aparecer duas vezes no mesmo dia. Use exatamente um destes: ${PREPAROS.join(", ")}; ou "nenhum". "à milanesa", "schnitzel" e "empanado" são todos "empanado". "à parmegiana" é "parmegiana". Grelhado, assado, cozido, refogado, frito simples (batata frita), ensopado e ao molho são "nenhum".
3. "reaproveitar": de 0 a 2 ideias de prato pra usar a SOBRA deste prato no dia seguinte, no mesmo buffet, que a cozinha faça de verdade (ex.: carreteiro → "Bolinho de carreteiro"; frango assado → "Frango desfiado" ou "Torta de frango"; feijão → "Feijão tropeiro"; purê → "Bolinho de batata"; carne de panela → "Escondidinho de carne"). Nome curto do prato com inicial maiúscula e o grupo ("proteinas" ou "carboidratos"). Nada para frituras simples, saladas, sobremesas e bases que não sobram (arroz branco, batata frita, massa caseira): devolva [].
4. "reconhecido": false quando você não sabe o que é o prato (nome de casa, abreviação, erro de digitação que não dá pra entender). Aí devolva destaques [] e preparo "nenhum".
Devolva um item por prato, com o mesmo número "n" da lista.`;

const ESQUEMA = {
  type: "object",
  properties: {
    pratos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer" },
          destaques: { type: "array", items: { type: "string" } },
          preparo: { type: "string", enum: [...PREPAROS, "nenhum"] },
          reaproveitar: {
            type: "array",
            items: {
              type: "object",
              properties: { nome: { type: "string" }, grupo: { type: "string", enum: ["proteinas", "carboidratos"] } },
              required: ["nome", "grupo"],
              additionalProperties: false,
            },
          },
          reconhecido: { type: "boolean" },
        },
        required: ["n", "destaques", "preparo", "reaproveitar", "reconhecido"],
        additionalProperties: false,
      },
    },
  },
  required: ["pratos"],
  additionalProperties: false,
} as const;

export type Ideia = { nome: string; grupo: "proteinas" | "carboidratos" };
type Lido = Analise & { reconhecido: boolean; reaproveitar: Ideia[] };
type Prato = { grupo: string; nome: string };

const ROTULO_GRUPO: Record<string, string> = { proteinas: "proteína", carboidratos: "acompanhamento", especial: "sobremesa/especial" };

/** Lê um lote de pratos. Devolve na mesma ordem (null = a IA não devolveu esse). */
async function lerLote(pratos: Prato[], empresaId: string | null): Promise<(Lido | null)[]> {
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  const lista = pratos.map((p, i) => `${i + 1}. ${p.nome} (${ROTULO_GRUPO[p.grupo] ?? p.grupo})`).join("\n");
  let erro: string | null = null;
  let uso = { entrada: 0, saida: 0 };
  try {
    const r = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: INSTRUCOES,
      messages: [{ role: "user", content: `Pratos:\n${lista}` }],
    });
    uso = { entrada: r.usage.input_tokens ?? 0, saida: r.usage.output_tokens ?? 0 };
    if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens") throw new Error(`a IA parou (${r.stop_reason})`);
    const texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = JSON.parse(texto) as { pratos: { n: number; destaques: string[]; preparo: string; reaproveitar?: Ideia[]; reconhecido: boolean }[] };
    const out: (Lido | null)[] = pratos.map(() => null);
    for (const p of json.pratos ?? []) {
      const i = Number(p.n) - 1;
      if (i < 0 || i >= pratos.length) continue;
      const destaques = [...new Set((p.destaques ?? []).map((d) => String(d).trim().toLowerCase()).filter((d) => d && d.length <= 40))].slice(0, 3);
      const reaproveitar = (p.reaproveitar ?? [])
        .map((x) => ({ nome: String(x?.nome ?? "").trim().slice(0, 60), grupo: x?.grupo === "proteinas" ? ("proteinas" as const) : ("carboidratos" as const) }))
        .filter((x) => x.nome.length >= 3)
        .slice(0, 2);
      out[i] = { destaques, preparo: p.preparo && p.preparo !== "nenhum" ? p.preparo : null, reaproveitar, reconhecido: p.reconhecido !== false };
    }
    return out;
  } catch (e) {
    erro = e instanceof Error ? e.message.slice(0, 300) : "falhou";
    throw e;
  } finally {
    // Custo no mesmo registro do Ajudante (sem pessoa: é a leitura automática).
    try {
      await createAdminClient().from("ajudante_uso").insert({
        ...(empresaId ? { empresa_id: empresaId } : {}),
        user_id: null,
        pergunta: `[cardápio] leitura de ${pratos.length} prato(s)`,
        tela: "/cardapio-do-dia",
        modelo: MODELO,
        tokens_entrada: uso.entrada,
        tokens_saida: uso.saida,
        custo_usd: Math.round(((uso.entrada * PRECO.entrada + uso.saida * PRECO.saida) / 1e6) * 100000) / 100000,
        erro,
      });
    } catch { /* registrar o custo é extra */ }
  }
}

type Linha = { id: string; grupo: string; nome: string; empresa_id: string | null; analise_por: string | null };

/** Lê e grava os pratos dados (só os que a IA ainda não leu ou que ela mesma leu). */
async function analisarLinhas(db: Db, linhasCat: Linha[]): Promise<number> {
  let gravados = 0;
  for (let i = 0; i < linhasCat.length; i += LOTE) {
    const lote = linhasCat.slice(i, i + LOTE);
    const lidos = await lerLote(lote, lote[0]?.empresa_id ?? null);
    const agora = new Date().toISOString();
    await Promise.all(lote.map(async (l, j) => {
      const a = lidos[j];
      if (!a) return;
      const { error } = await db.from("cardapio_itens").update({
        destaques: a.destaques,
        preparo: a.preparo,
        reaproveitar: a.reaproveitar,
        analise_em: agora,
        analise_por: "ia",
        analise_erro: a.reconhecido ? null : "não reconheci o prato",
      }).eq("id", l.id).or("analise_por.is.null,analise_por.eq.ia");
      if (!error) gravados++;
    }));
  }
  return gravados;
}

/** Rotina: lê os pratos que ainda não foram lidos (todas as empresas). */
export async function analisarPendentes(limite = 200): Promise<{ lidos: number; faltam: number }> {
  if (!iaConfigurada()) return { lidos: 0, faltam: 0 };
  const db = createAdminClient() as Db;
  const { data, count } = await db
    .from("cardapio_itens")
    .select("id, grupo, nome, empresa_id, analise_por", { count: "exact" })
    .eq("ativo", true)
    .is("analise_em", null)
    .order("usos", { ascending: false })
    .limit(limite);
  const linhasCat = (data as Linha[] | null) ?? [];
  if (linhasCat.length === 0) return { lidos: 0, faltam: 0 };
  // Uma empresa por lote (o custo vai pra empresa certa).
  const porEmpresa = new Map<string, Linha[]>();
  for (const l of linhasCat) porEmpresa.set(String(l.empresa_id), [...(porEmpresa.get(String(l.empresa_id)) ?? []), l]);
  let lidos = 0;
  for (const ls of porEmpresa.values()) lidos += await analisarLinhas(db, ls);
  return { lidos, faltam: Math.max(0, (count ?? 0) - lidos) };
}

/**
 * Confere o dia antes de publicar: lê na hora os pratos que a IA ainda não
 * leu (prato novo digitado agora) e devolve os repetidos. Se a IA falhar,
 * devolve só o que já dava pra saber — nunca trava a publicação.
 */
export async function conflitosParaPublicar(
  db: Db,
  dia: { proteinas: string | null; carboidratos: string | null; especial: string | null; empresa_id?: string | null },
): Promise<Conflito[]> {
  const sel = { proteinas: linhas(dia.proteinas), carboidratos: linhas(dia.carboidratos), especial: linhas(dia.especial) } as Record<Grupo, string[]>;
  const todos = GRUPOS.flatMap((g) => sel[g]);
  if (todos.length < 2) return [];
  let q = db.from("cardapio_itens").select("id, grupo, nome, empresa_id, analise_por, analise_em, destaques, preparo").eq("ativo", true);
  if (dia.empresa_id) q = q.eq("empresa_id", dia.empresa_id);
  const { data } = await q;
  type Cat = Linha & { analise_em: string | null; destaques: string[] | null; preparo: string | null };
  const cat = (data as Cat[] | null) ?? [];
  const porChave = new Map(cat.map((c) => [chavePrato(c.grupo, c.nome), c]));
  const faltam = GRUPOS.flatMap((g) => sel[g].map((n) => porChave.get(chavePrato(g, n)))).filter((c): c is Cat => !!c && !c.analise_em);
  if (faltam.length > 0 && iaConfigurada()) {
    try {
      const lidos = await lerLote(faltam, faltam[0].empresa_id);
      const agora = new Date().toISOString();
      await Promise.all(faltam.map(async (c, j) => {
        const a = lidos[j];
        if (!a) return;
        c.destaques = a.destaques; c.preparo = a.preparo; c.analise_em = agora;
        await db.from("cardapio_itens").update({ destaques: a.destaques, preparo: a.preparo, reaproveitar: a.reaproveitar, analise_em: agora, analise_por: "ia", analise_erro: a.reconhecido ? null : "não reconheci o prato" })
          .eq("id", c.id).or("analise_por.is.null,analise_por.eq.ia");
      }));
    } catch (e) {
      await registrarErro("cardapio:ia", e);
    }
  }
  const analises = new Map<string, Analise>();
  for (const c of cat) if (c.analise_em) analises.set(chavePrato(c.grupo, c.nome), { destaques: c.destaques, preparo: c.preparo });
  return conflitosDoDia(sel, analises);
}


/**
 * Alguém publicou com prato repetido e decidiu manter: guarda o aviso
 * (cardapio_alertas) e manda pro celular de quem tem a caixinha "recebe
 * aviso do cardápio" em Colaboradores. Nunca lança erro.
 */
export async function registrarAlertaCardapio(
  data: string,
  conflitos: Conflito[],
  motivo: string | null,
  ator: { nome: string; userId?: string | null; colabId?: string | null },
  empresaId: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: alerta } = await admin.from("cardapio_alertas").insert({
      ...(empresaId ? { empresa_id: empresaId } : {}),
      data,
      conflitos,
      motivo: motivo?.trim().slice(0, 500) || null,
      por_nome: ator.nome || null,
      por_colab_id: ator.colabId ?? null,
      por_user_id: ator.userId ?? null,
    }).select("id").single();
    let q = admin.from("colaboradores").select("id").eq("ativo", true).eq("recebe_alerta_cardapio", true);
    if (empresaId) q = q.eq("empresa_id", empresaId);
    const { data: quem } = await q;
    const ids = ((quem as { id: string }[] | null) ?? []).map((c) => c.id).filter((id) => id !== ator.colabId);
    if (ids.length === 0) return;
    const { notificarColaboradores } = await import("@/lib/push");
    const [, m, d] = data.split("-");
    const dia = `${d}/${m}`;
    const primeiro = conflitos[0];
    const resto = conflitos.length > 1 ? ` (e mais ${conflitos.length - 1})` : "";
    const corpo = `${ator.nome || "Alguém"} publicou o cardápio de ${dia} com ${primeiro.pratos.join(" e ")} (${primeiro.chave})${resto}.${motivo?.trim() ? ` Motivo: ${motivo.trim().slice(0, 140)}` : ""}`;
    const n = await notificarColaboradores(ids, { titulo: "Cardápio com prato repetido", corpo });
    if (alerta) await admin.from("cardapio_alertas").update({ avisados: n }).eq("id", (alerta as { id: number }).id);
  } catch (e) {
    await registrarErro("cardapio:alerta", e);
  }
}
