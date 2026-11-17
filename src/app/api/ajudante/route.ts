import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { perfilDaSessao, usuarioDaSessao } from "@/lib/sessao";
import { empresaAtual } from "@/lib/empresa";
import { podeAcessar } from "@/lib/permissoes";
import { MANUAL } from "@/lib/ajudante/manual";
import { FERRAMENTAS } from "@/lib/ajudante/ferramentas";
import { ACOES, ACOES_SO_DONO, ACAO_VALIDADE_MIN } from "@/lib/ajudante/acoes";

// Ajudante do painel.
//  Etapa 1: responde "como faço" a partir do manual do sistema (docs/ajudante).
//  Etapa 2: CONSULTA dados (vendas, estoque e compras, equipe) por ferramentas
//  fixas de leitura (src/lib/ajudante/ferramentas), com o cliente da SESSÃO e
//  só as que a pessoa pode ver pela tela (podeAcessar).
//  Etapa 3: PREPARA ações (src/lib/ajudante/acoes); a pessoa confirma num
//  cartão e só então /api/ajudante/acao executa (migration 0316). Só o dono.
// Cada pergunta vira uma linha em ajudante_uso (migrations 0314/0315) com o custo,
// que serve pro limite do dia.
//
// Resposta em NDJSON, uma linha por evento: {"t":"txt","v":"..."} (pedaço da
// resposta), {"t":"st","v":"..."} (o que está consultando agora) e
// {"t":"acao","v":{id,resumo,detalhes}} (cartão de ação pra confirmar).

export const runtime = "nodejs";
export const maxDuration = 180;

const MODELO = "claude-opus-5-5";
// US$ por milhão de tokens (Opus 5.5): entrada, gravar no cache, ler do cache, saída.
// O manual vai no cache de 1 hora, que custa 2× a entrada pra gravar (o de 5 min é 1,25×).
const PRECO = { entrada: 4, cacheEscrita: 8, cacheLeitura: 0.2, saida: 20 };
const LIMITE_PESSOA_DIA = 40;
const LIMITE_EMPRESA_USD_DIA = Number(process.env.AJUDANTE_LIMITE_DIA_USD) > 0 ? Number(process.env.AJUDANTE_LIMITE_DIA_USD) : 5;
const MAX_MENSAGENS = 20;
const MAX_CARACTERES = 4000;
const MAX_VOLTAS = 6; // idas e vindas de consulta por pergunta
const MAX_RESULTADO = 12000; // caracteres de cada resultado de consulta mandados pra IA

const INSTRUCOES = `Você é o Ajudante, o assistente que mora dentro do painel de um sistema de gestão de restaurante. Quem conversa com você são funcionários do escritório e do caixa, em geral sem conhecimento técnico, usando o computador.

Você faz duas coisas:
1. Explica como usar o sistema: onde fica cada coisa, como fazer cada tarefa, o que significa uma mensagem ou trava. Para isso você conhece o sistema pelo MANUAL abaixo, e só por ele.
2. Consulta dados do restaurante com as ferramentas de consulta (vendas e faturamento, estoque e compras, equipe). Elas só leem.
3. Prepara ações no sistema com as ferramentas que começam com "acao_" (equipe, recados e lembretes, estoque e compras, cadastros). Preparar NÃO faz a ação: aparece um cartão para a pessoa conferir e clicar em "Confirmar". Nada de dinheiro (caixa, contas, pagamentos, notas fiscais).

Sobre ações:
- Só prepare uma ação quando a pessoa pedir claramente para fazer aquilo. Se faltar algo essencial (quem, quando, qual turno, qual valor), pergunte antes em vez de adivinhar.
- Depois de preparar, diga em uma frase curta que o cartão está aí para ela conferir e confirmar. Nunca diga que já foi feito: só o clique dela faz.
- Se ela pedir várias ações, prepare cada uma (cada uma vira um cartão).
- Quando a pessoa quer fazer algo que o sistema ainda não tem (não está no manual nem nas ferramentas) e a ideia faz sentido, explique que ainda não existe e já prepare o cartão de sugestão (acao_sugerir_melhoria) para o desenvolvedor do sistema, escrevendo o pedido de forma clara. Ela decide se manda.

Como responder:
- Português do Brasil simples, direto e curto. Comece pela resposta; explique o porquê só se ajudar.
- Para tarefas, dê passos numerados e cite menus, telas e botões com o nome exato entre aspas, como aparecem no manual.
- Para números, use as ferramentas; nunca invente nem estime um valor que não veio delas. Diga sempre o período que você consultou (ex.: "de 10/11 a 16/11") e, se a ferramenta trouxe uma observação ou ressalva, repasse. Valores em reais no formato R$ 1.234,56 e datas no formato dia/mês.
- Datas relativas ("ontem", "semana passada", "este mês") contam a partir de hoje, no fuso de Brasília; a semana começa na segunda-feira.
- Só use as ferramentas liberadas para esta pessoa (a lista vem logo abaixo). Se ela pedir algo de uma área que não está liberada, ou fora de vendas, estoque/compras e equipe (por exemplo contas a pagar e financeiro), diga que o login dela não tem essa consulta e, se existir, em qual tela a informação fica.
- Se o manual ou as ferramentas não cobrem a pergunta, diga que não sabe com certeza e sugira falar com o responsável pelo sistema. Não invente tela, botão, regra ou caminho.
- Se a tela citada não aparece para a pessoa, provavelmente o login dela não tem permissão; quem libera é o dono, em "Configurações" → "Usuários e permissões".
- Nunca peça nem aceite senhas, códigos de acesso ou dados de cartão.
- Use negrito e listas com moderação; nada de tabelas largas.`;

type MensagemEntrada = { papel: "usuario" | "ajudante"; texto: string };

function erro(status: number, mensagem: string) {
  return Response.json({ erro: mensagem }, { status });
}

function hojeBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Começo do dia de hoje em Brasília (UTC−3), em ISO UTC. */
function inicioDoDiaBR() {
  return `${hojeBR()}T03:00:00.000Z`;
}

function lerEntrada(corpo: unknown): { mensagens: MensagemEntrada[]; tela: string } | null {
  if (!corpo || typeof corpo !== "object") return null;
  const { mensagens, tela } = corpo as { mensagens?: unknown; tela?: unknown };
  if (!Array.isArray(mensagens) || mensagens.length === 0 || mensagens.length > MAX_MENSAGENS) return null;
  const lista: MensagemEntrada[] = [];
  for (const [i, m] of mensagens.entries()) {
    if (!m || typeof m !== "object") return null;
    const { papel, texto } = m as { papel?: unknown; texto?: unknown };
    const esperado = i % 2 === 0 ? "usuario" : "ajudante";
    if (papel !== esperado || typeof texto !== "string") return null;
    const t = texto.trim();
    if (!t || t.length > MAX_CARACTERES) return null;
    lista.push({ papel: esperado, texto: t });
  }
  if (lista[lista.length - 1].papel !== "usuario") return null;
  const telaOk = typeof tela === "string" && /^\/[\w\-/[\]]{0,120}$/.test(tela) ? tela : "";
  return { mensagens: lista, tela: telaOk };
}

// Todas as ferramentas vão sempre na mesma ordem (o cache do manual depende de
// o começo do pedido não mudar); quem não pode, recebe "sem permissão" ao usar.
const DEFINICOES: Anthropic.Beta.BetaToolUnion[] = [...FERRAMENTAS, ...ACOES].map((f) => ({
  name: f.nome,
  description: f.descricao,
  input_schema: f.parametros,
  eager_input_streaming: true,
}));
const POR_NOME = new Map(FERRAMENTAS.map((f) => [f.nome, f]));
const ACAO_POR_NOME = new Map(ACOES.map((a) => [a.nome, a]));

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return erro(503, "O Ajudante ainda não está ligado neste sistema.");

  const { user } = await usuarioDaSessao();
  if (!user) return erro(401, "Entre no sistema de novo para usar o Ajudante.");
  const perfil = await perfilDaSessao();
  const empresaId = perfil?.empresa_id;
  if (!perfil || !empresaId) return erro(403, "Seu login não está ligado a uma empresa.");

  let entrada: ReturnType<typeof lerEntrada>;
  try {
    entrada = lerEntrada(await req.json());
  } catch {
    entrada = null;
  }
  if (!entrada) return erro(400, "Não entendi a pergunta. Escreva de novo, com até 4.000 letras.");

  // Limites do dia: por pessoa (quantidade) e pela empresa (gasto em dólar).
  const admin = createAdminClient();
  const desde = inicioDoDiaBR();
  const [daPessoa, daEmpresa] = await Promise.all([
    admin.from("ajudante_uso").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("user_id", user.id).gte("criado_em", desde),
    admin.from("ajudante_uso").select("custo_usd").eq("empresa_id", empresaId).gte("criado_em", desde).limit(1000),
  ]);
  if (daPessoa.error || daEmpresa.error) return erro(503, "Não consegui conferir o limite agora. Confira a internet e tente de novo.");
  if ((daPessoa.count ?? 0) >= LIMITE_PESSOA_DIA) {
    return erro(429, `Você já fez ${LIMITE_PESSOA_DIA} perguntas hoje, o limite do dia. Amanhã libera de novo.`);
  }
  const gastoHoje = (daEmpresa.data ?? []).reduce((s, r) => s + Number(r.custo_usd || 0), 0);
  if (gastoHoje >= LIMITE_EMPRESA_USD_DIA) {
    return erro(429, "O Ajudante atingiu o limite de uso de hoje da empresa. Amanhã libera de novo.");
  }

  const dono = perfil.papel === "dono";
  const permissoes = perfil.permissoes ?? [];
  const liberadas = new Set(FERRAMENTAS.filter((f) => f.telas.some((t) => podeAcessar(t, dono, permissoes))).map((f) => f.nome));
  const acoesLiberadas = new Set(
    ACOES.filter((a) => (!ACOES_SO_DONO || dono || a.todos) && a.telas.some((t) => podeAcessar(t, dono, permissoes))).map((a) => a.nome),
  );
  const hoje = hojeBR();
  const diaSemana = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][new Date(`${hoje}T12:00:00Z`).getUTCDay()];

  const empresa = await empresaAtual().catch(() => null);
  const quem = [
    `Empresa: ${empresa?.nome ?? "o restaurante"}.`,
    `Hoje é ${diaSemana}, ${hoje} (Brasília).`,
    `Pessoa: ${perfil.nome ?? "funcionário"} (${dono ? "dono, vê todas as telas" : "funcionário"}).`,
    !dono ? `Telas liberadas para ela: ${permissoes.join(", ") || "nenhuma além do básico"}.` : "",
    liberadas.size
      ? `Ferramentas de consulta liberadas para ela: ${[...liberadas].join(", ")}. As outras ferramentas NÃO estão liberadas para esta pessoa.`
      : "Nenhuma ferramenta de consulta está liberada para esta pessoa: só explique como usar o sistema.",
    acoesLiberadas.size
      ? `Ações liberadas para ela: ${[...acoesLiberadas].join(", ")}.`
      : "Nenhuma ação está liberada para esta pessoa (por enquanto só o dono faz ações pelo Ajudante): se ela pedir para fazer algo, explique como fazer pela tela.",
    !dono && ACOES_SO_DONO ? "Das ações, esta pessoa só pode mandar sugestão de melhoria (acao_sugerir_melhoria); as outras são só do dono por enquanto." : "",
  ].filter(Boolean).join(" ");

  const historico: Anthropic.Beta.BetaMessageParam[] = entrada.mensagens.map((m, i) => {
    const ultima = i === entrada.mensagens.length - 1;
    const texto = ultima && entrada.tela ? `${m.texto}\n\n(Tela aberta agora no painel: ${entrada.tela})` : m.texto;
    return { role: m.papel === "usuario" ? "user" : "assistant", content: texto };
  });
  const pergunta = entrada.mensagens[entrada.mensagens.length - 1].texto.slice(0, 500);

  const db = await createClient();
  const client = new Anthropic();
  const encoder = new TextEncoder();

  const corpo = new ReadableStream<Uint8Array>({
    async start(controller) {
      const mandar = (t: "txt" | "st" | "acao", v: unknown) => controller.enqueue(encoder.encode(JSON.stringify({ t, v }) + "\n"));
      let falha: string | null = null;
      const total = { entrada: 0, escrita: 0, leitura: 0, saida: 0 };
      let modeloUsado = MODELO;
      const consultas: string[] = [];
      const mensagens = [...historico];
      try {
        for (let volta = 0; volta < MAX_VOLTAS; volta++) {
          const stream = client.beta.messages.stream({
            model: MODELO,
            max_tokens: 4000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: "low" },
            tools: DEFINICOES,
            // Ferramentas + instruções + manual: sempre iguais → ficam no cache. O "quem" vem depois.
            system: [
              { type: "text", text: `${INSTRUCOES}\n\n# MANUAL DO SISTEMA\n\n${MANUAL}`, cache_control: { type: "ephemeral", ttl: "1h" } },
              { type: "text", text: quem },
            ],
            messages: mensagens,
          });
          for await (const ev of stream) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") mandar("txt", ev.delta.text);
          }
          const final = await stream.finalMessage();
          modeloUsado = final.model;
          total.entrada += Number(final.usage.input_tokens ?? 0);
          total.escrita += Number(final.usage.cache_creation_input_tokens ?? 0);
          total.leitura += Number(final.usage.cache_read_input_tokens ?? 0);
          total.saida += Number(final.usage.output_tokens ?? 0);

          if (final.stop_reason === "refusal") {
            mandar("txt", "\n\nNão consigo responder essa pergunta. Tente perguntar de outro jeito.");
            falha = "recusa";
            break;
          }
          if (final.stop_reason === "pause_turn") {
            mensagens.push({ role: "assistant", content: final.content });
            continue;
          }
          const pedidos = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (final.stop_reason === "max_tokens") {
            mandar("txt", pedidos.length ? "\n\nA pergunta ficou grande demais para consultar de uma vez. Pergunte por partes." : "\n\n(A resposta ficou longa demais e foi cortada. Pergunte por partes.)");
            break;
          }
          if (final.stop_reason !== "tool_use" || pedidos.length === 0) break;
          if (volta === MAX_VOLTAS - 1) {
            mandar("txt", "\n\nPrecisei de consultas demais para essa pergunta. Tente perguntar uma coisa de cada vez.");
            falha = "voltas";
            break;
          }

          mensagens.push({ role: "assistant", content: final.content });
          const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const p of pedidos) {
            const f = POR_NOME.get(p.name);
            const args = p.input && typeof p.input === "object" && !Array.isArray(p.input) ? (p.input as Record<string, unknown>) : null;
            consultas.push(p.name);
            const acao = ACAO_POR_NOME.get(p.name);
            if (acao) {
              if (!args || !acoesLiberadas.has(acao.nome)) {
                resultados.push({ type: "tool_result", tool_use_id: p.id, is_error: true, content: args ? "Sem permissão: esta pessoa não pode fazer esta ação pelo Ajudante. Explique como fazer pela tela." : "Pedido de ação inválido." });
                continue;
              }
              mandar("st", "Preparando…");
              try {
                const prep = await acao.preparar(db, args, { empresaId, hoje });
                const detalhes = prep.detalhes.map((d) => String(d).slice(0, 200)).slice(0, 10);
                const { data: salvo, error: erroSalvar } = await admin
                  .from("ajudante_acoes")
                  .insert({ empresa_id: empresaId, user_id: user.id, acao: acao.nome, resumo: prep.resumo.slice(0, 300), detalhes, dados: prep.dados })
                  .select("id")
                  .single();
                if (erroSalvar || !salvo) throw new Error("Não consegui preparar agora. Tente de novo.");
                mandar("acao", { id: salvo.id, resumo: prep.resumo, detalhes });
                resultados.push({
                  type: "tool_result",
                  tool_use_id: p.id,
                  content: `Ação PREPARADA (ainda não feita) e mostrada num cartão para a pessoa conferir: "${prep.resumo}". Só acontece se ela clicar em "Confirmar" em até ${ACAO_VALIDADE_MIN} minutos.`,
                });
              } catch (e) {
                const msg = e instanceof Error && e.message.length < 400 ? e.message : "Não deu para preparar essa ação.";
                resultados.push({ type: "tool_result", tool_use_id: p.id, is_error: true, content: msg });
              }
              continue;
            }
            if (!f || !args) {
              resultados.push({ type: "tool_result", tool_use_id: p.id, is_error: true, content: "Consulta inválida." });
              continue;
            }
            if (!liberadas.has(f.nome)) {
              resultados.push({ type: "tool_result", tool_use_id: p.id, is_error: true, content: "Sem permissão: o login desta pessoa não pode ver esta informação no painel." });
              continue;
            }
            mandar("st", `Consultando ${f.nome.replace(/_/g, " ")}…`);
            try {
              const r = await f.executar(db, args, { empresaId, hoje });
              let json = JSON.stringify(r ?? null);
              if (json.length > MAX_RESULTADO) json = json.slice(0, MAX_RESULTADO) + '…"(resultado cortado: peça um período ou filtro menor)"';
              resultados.push({ type: "tool_result", tool_use_id: p.id, content: json });
            } catch (e) {
              const msg = e instanceof Error && e.message.length < 300 ? e.message : "A consulta falhou.";
              resultados.push({ type: "tool_result", tool_use_id: p.id, is_error: true, content: msg });
            }
          }
          mensagens.push({ role: "user", content: resultados });
        }
      } catch (e) {
        falha = e instanceof Anthropic.APIError ? `api ${e.status ?? ""}` : "falha";
        const msg =
          e instanceof Anthropic.RateLimitError
            ? "O Ajudante está ocupado agora. Espere um minuto e tente de novo."
            : e instanceof Anthropic.AuthenticationError
              ? "A chave do Ajudante não está valendo. Avise o responsável pelo sistema."
              : "Não consegui responder agora. Confira a internet e tente de novo.";
        mandar("txt", `\n\n${msg}`);
      } finally {
        const custo =
          (total.entrada * PRECO.entrada + total.escrita * PRECO.cacheEscrita + total.leitura * PRECO.cacheLeitura + total.saida * PRECO.saida) / 1_000_000;
        await admin.from("ajudante_uso").insert({
          empresa_id: empresaId,
          user_id: user.id,
          pergunta,
          tela: entrada.tela || null,
          modelo: modeloUsado,
          tokens_entrada: total.entrada,
          tokens_cache_escrita: total.escrita,
          tokens_cache_leitura: total.leitura,
          tokens_saida: total.saida,
          custo_usd: Math.round(custo * 100000) / 100000,
          erro: falha,
          consultas: consultas.length ? consultas.slice(0, 20) : null,
        });
        controller.close();
      }
    },
  });

  return new Response(corpo, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
