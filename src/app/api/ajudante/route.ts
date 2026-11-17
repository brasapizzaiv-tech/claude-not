import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { perfilDaSessao, usuarioDaSessao } from "@/lib/sessao";
import { empresaAtual } from "@/lib/empresa";
import { MANUAL } from "@/lib/ajudante/manual";

// Ajudante do painel, etapa 1: responde "como faço" a partir do manual do
// sistema (docs/ajudante). Não vê dados nem faz nada no sistema — só conversa.
// Cada pergunta vira uma linha em ajudante_uso (migration 0314) com o custo,
// que serve pro limite do dia.

export const runtime = "nodejs";
export const maxDuration = 120;

const MODELO = "claude-opus-5-5";
// US$ por milhão de tokens (Opus 5.5): entrada, gravar no cache, ler do cache, saída.
const PRECO = { entrada: 4, cacheEscrita: 5, cacheLeitura: 0.2, saida: 20 };
const LIMITE_PESSOA_DIA = 40;
const LIMITE_EMPRESA_USD_DIA = Number(process.env.AJUDANTE_LIMITE_DIA_USD) > 0 ? Number(process.env.AJUDANTE_LIMITE_DIA_USD) : 5;
const MAX_MENSAGENS = 20;
const MAX_CARACTERES = 4000;

const INSTRUCOES = `Você é o Ajudante, o assistente que mora dentro do painel de um sistema de gestão de restaurante. Quem conversa com você são funcionários do escritório e do caixa, em geral sem conhecimento técnico, usando o computador.

Seu trabalho é explicar como usar o sistema: onde fica cada coisa, como fazer cada tarefa, o que significa uma mensagem ou trava, e o que fazer quando algo não funciona. Você conhece o sistema pelo MANUAL abaixo, e só por ele.

Como responder:
- Português do Brasil simples, direto e curto. Comece pela resposta; explique o porquê só se ajudar.
- Para tarefas, dê passos numerados e cite menus, telas e botões com o nome exato entre aspas, como aparecem no manual (por exemplo: no menu "Financeiro", abra "Contas a pagar" e clique em "Nova conta").
- Se o manual não cobre a pergunta, diga que não sabe com certeza e sugira falar com o responsável pelo sistema. Não invente tela, botão, regra ou caminho que não esteja no manual.
- Você não vê os dados do restaurante (vendas, pessoas, estoque, valores) nem consegue fazer nada no sistema. Se pedirem um número ou uma ação, explique em qual tela a pessoa encontra ou faz aquilo.
- Se a tela citada não aparece para a pessoa, provavelmente o login dela não tem permissão; quem libera é o dono, em "Configurações" → "Usuários e permissões".
- Nunca peça nem aceite senhas, códigos de acesso ou dados de cartão.
- Use negrito e listas com moderação; nada de tabelas largas.`;

type MensagemEntrada = { papel: "usuario" | "ajudante"; texto: string };

function erro(status: number, mensagem: string) {
  return Response.json({ erro: mensagem }, { status });
}

/** Começo do dia de hoje em Brasília (UTC−3), em ISO UTC. */
function inicioDoDiaBR() {
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  return `${hoje}T03:00:00.000Z`;
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

  const empresa = await empresaAtual().catch(() => null);
  const quem = [
    `Empresa: ${empresa?.nome ?? "o restaurante"}.`,
    `Pessoa: ${perfil.nome ?? "funcionário"} (${perfil.papel === "dono" ? "dono, vê todas as telas" : "funcionário"}).`,
    perfil.papel !== "dono" ? `Permissões liberadas para ela: ${(perfil.permissoes ?? []).join(", ") || "nenhuma além do básico"}.` : "",
  ].filter(Boolean).join(" ");

  const mensagens: Anthropic.Beta.BetaMessageParam[] = entrada.mensagens.map((m, i) => {
    const ultima = i === entrada.mensagens.length - 1;
    const texto = ultima && entrada.tela ? `${m.texto}\n\n(Tela aberta agora no painel: ${entrada.tela})` : m.texto;
    return { role: m.papel === "usuario" ? "user" : "assistant", content: texto };
  });
  const pergunta = entrada.mensagens[entrada.mensagens.length - 1].texto.slice(0, 500);

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const corpo = new ReadableStream<Uint8Array>({
    async start(controller) {
      let falha: string | null = null;
      let usage: { input_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; output_tokens?: number | null } | null = null;
      let modeloUsado = MODELO;
      try {
        const stream = client.beta.messages.stream({
          model: MODELO,
          max_tokens: 4000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low" },
          // O manual (grande e igual pra todos) fica no cache; o "quem" vem depois.
          system: [
            { type: "text", text: `${INSTRUCOES}\n\n# MANUAL DO SISTEMA\n\n${MANUAL}`, cache_control: { type: "ephemeral", ttl: "1h" } },
            { type: "text", text: quem },
          ],
          messages: mensagens,
        });
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(ev.delta.text));
          }
        }
        const final = await stream.finalMessage();
        usage = final.usage;
        modeloUsado = final.model;
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\nNão consigo responder essa pergunta. Tente perguntar de outro jeito, sobre como usar o sistema."));
          falha = "recusa";
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("\n\n(A resposta ficou longa demais e foi cortada. Pergunte por partes.)"));
        }
      } catch (e) {
        falha = e instanceof Anthropic.APIError ? `api ${e.status ?? ""}` : "falha";
        const msg =
          e instanceof Anthropic.RateLimitError
            ? "O Ajudante está ocupado agora. Espere um minuto e tente de novo."
            : e instanceof Anthropic.AuthenticationError
              ? "A chave do Ajudante não está valendo. Avise o responsável pelo sistema."
              : "Não consegui responder agora. Confira a internet e tente de novo.";
        controller.enqueue(encoder.encode(`\n\n${msg}`));
      } finally {
        const t = {
          entrada: Number(usage?.input_tokens ?? 0),
          escrita: Number(usage?.cache_creation_input_tokens ?? 0),
          leitura: Number(usage?.cache_read_input_tokens ?? 0),
          saida: Number(usage?.output_tokens ?? 0),
        };
        const custo =
          (t.entrada * PRECO.entrada + t.escrita * PRECO.cacheEscrita + t.leitura * PRECO.cacheLeitura + t.saida * PRECO.saida) / 1_000_000;
        await admin.from("ajudante_uso").insert({
          empresa_id: empresaId,
          user_id: user.id,
          pergunta,
          tela: entrada.tela || null,
          modelo: modeloUsado,
          tokens_entrada: t.entrada,
          tokens_cache_escrita: t.escrita,
          tokens_cache_leitura: t.leitura,
          tokens_saida: t.saida,
          custo_usd: Math.round(custo * 100000) / 100000,
          erro: falha,
        });
        controller.close();
      }
    },
  });

  return new Response(corpo, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
