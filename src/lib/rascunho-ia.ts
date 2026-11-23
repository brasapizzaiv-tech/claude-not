// Leitura de RASCUNHO À MÃO de fornecedor (pedido do Rafael, 23/11/2026): a
// fruteira é paga em dinheiro e não emite nota — manda uma folha escrita à mão
// com produto, quantidade, preço e total. A foto vai pra IA (Claude, visão), que
// devolve as linhas; a pessoa confere na tela e a compra entra em Notas como
// nota pendente, igual às de XML. Só no servidor (usa a chave da Anthropic).
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { UNIDADES_RASCUNHO, type LeituraRascunho } from "@/lib/rascunho";

const MODELO = "claude-opus-5-5";
// US$ por milhão de tokens (Opus 5.5).
const PRECO = { entrada: 4, saida: 20 };

export const iaConfigurada = () => !!process.env.ANTHROPIC_API_KEY;

const INSTRUCOES = `Você lê fotos de RASCUNHOS ESCRITOS À MÃO de um fornecedor de hortifrúti (fruteira) de um restaurante no Rio Grande do Sul (Brasil). A folha tem colunas: produto | quantidade | preço unitário (R$) | total da linha (R$). No fim pode ter o total geral.
Pode vir MAIS DE UMA FOTO: são as folhas do MESMO rascunho, na ordem (a 2ª continua a 1ª). Devolva todas as linhas de todas as folhas numa lista só; o total geral costuma estar só na última folha e vale pelo rascunho inteiro. Se a mesma folha aparecer duas vezes, leia uma vez só e avise em "observacao".

Regras de leitura:
- Uma linha por produto, na ordem da folha. Ignore linhas riscadas/canceladas, cabeçalhos, logotipos impressos do caderno e os dias da semana (D S T Q Q S S).
- Números: o separador decimal pode ser ponto ou vírgula ("4.80" e "4,80" = 4,80). Quantidade escrita como "2.112", "0,756", "10.602", "46.200", "8.600" é PESO em kg com 3 casas (2,112 kg; 46,2 kg; 8,6 kg) — não é milhar. Preço com ".00"/"-00"/"=00" no fim é centavos zero ("21.00" = 21,00; "4200" escrito sem ponto no total costuma ser 42,00 — confira com quantidade × preço).
- "kilo", "kg", "k" → unidade "KG". "unid", "und", "un" → "UN". Maço → "MC". Bandeja → "BDJ". Caixa → "CX". Pacote → "PCT". Dúzia → "DZ". Só número sem unidade: peso com casas decimais → "KG"; número inteiro → "UN".
- Às vezes a unidade foi escrita na coluna errada (ex.: "14 unid" na coluna do preço): coloque cada coisa no campo certo.
- Use quantidade × preço = total pra decidir algarismos difíceis de ler. Se mesmo assim não fechar, devolva o que está escrito e explique em "duvida" (curto). Se tudo fecha, "duvida" = null.
- "escrito": o nome como está na folha (sua melhor leitura, mesmo com erro de grafia).
- "descricao": o nome do produto corrigido, curto, com inicial maiúscula (ex.: "Beringela" → "Berinjela", "pimentão colorido", "Abobrinha", "Pepino japonês", "Tomate cereja", "Couve-flor", "Laranja", "Limão siciliano", "Batata doce", "Hortelã", "Agrião", "Repolho", "Rúcula"). "u" ou aspas embaixo de uma palavra = repete a palavra de cima ("pimentão colorido" seguido de "u verde" = "Pimentão verde").
- "produto": se a lista de produtos do restaurante (abaixo) tiver o MESMO produto, devolva o nome EXATAMENTE como está na lista; senão null. Não force: tomate ≠ tomate cereja; limão ≠ limão siciliano; cebola ≠ cebola roxa.
- "totalEscrito": o total geral escrito na folha, se houver; senão null.
- "data": a data escrita na folha no formato AAAA-MM-DD, se houver; senão null.
- "observacao": algo que a pessoa precisa saber (foto cortada, parte ilegível); senão null.`;

const ESQUEMA = {
  type: "object",
  properties: {
    linhas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          escrito: { type: "string" },
          descricao: { type: "string" },
          produto: { type: ["string", "null"] },
          qtd: { type: "number" },
          unidade: { type: "string", enum: [...UNIDADES_RASCUNHO] },
          valor_unit: { type: "number" },
          valor_total: { type: "number" },
          duvida: { type: ["string", "null"] },
        },
        required: ["escrito", "descricao", "produto", "qtd", "unidade", "valor_unit", "valor_total", "duvida"],
        additionalProperties: false,
      },
    },
    totalEscrito: { type: ["number", "null"] },
    data: { type: ["string", "null"] },
    observacao: { type: ["string", "null"] },
  },
  required: ["linhas", "totalEscrito", "data", "observacao"],
  additionalProperties: false,
} as const;

type TipoImagem = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : 0;
};

/** Lê as fotos (folhas) de UM rascunho numa leitura só. `produtos` = nomes do cadastro (pra devolver o nome igual). */
export async function lerRascunho(
  fotos: { base64: string; tipo: TipoImagem }[],
  produtos: string[],
  quem: { empresaId: string; userId: string | null },
): Promise<LeituraRascunho> {
  const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });
  let erro: string | null = null;
  let uso = { entrada: 0, saida: 0 };
  try {
    const r = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
      system: [
        { type: "text", text: INSTRUCOES },
        // A lista muda pouco: fica em cache e as próximas fotos saem mais baratas.
        { type: "text", text: `Produtos do restaurante:\n${produtos.join("\n")}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            ...fotos.flatMap((foto, i) => [
              ...(fotos.length > 1 ? [{ type: "text" as const, text: `Folha ${i + 1} de ${fotos.length}:` }] : []),
              { type: "image" as const, source: { type: "base64" as const, media_type: foto.tipo, data: foto.base64 } },
            ]),
            { type: "text", text: fotos.length > 1 ? "Leia este rascunho (todas as folhas)." : "Leia este rascunho." },
          ],
        },
      ],
    });
    uso = {
      entrada: (r.usage.input_tokens ?? 0) + (r.usage.cache_creation_input_tokens ?? 0) * 1.25 + (r.usage.cache_read_input_tokens ?? 0) * 0.1,
      saida: r.usage.output_tokens ?? 0,
    };
    if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens") throw new Error(`a IA parou (${r.stop_reason})`);
    const texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = JSON.parse(texto) as LeituraRascunho;
    const nomes = new Map(produtos.map((p) => [p.toLowerCase(), p]));
    const linhas = (json.linhas ?? [])
      .map((l) => ({
        escrito: String(l.escrito ?? "").trim().slice(0, 120),
        descricao: String(l.descricao ?? l.escrito ?? "").trim().slice(0, 120),
        produto: l.produto ? nomes.get(String(l.produto).trim().toLowerCase()) ?? null : null,
        qtd: num(l.qtd),
        unidade: (UNIDADES_RASCUNHO as readonly string[]).includes(l.unidade) ? l.unidade : "UN",
        valor_unit: num(l.valor_unit),
        valor_total: Math.round(num(l.valor_total) * 100) / 100,
        duvida: l.duvida ? String(l.duvida).trim().slice(0, 200) : null,
      }))
      .filter((l) => l.descricao);
    const data = typeof json.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.data) ? json.data : null;
    return {
      linhas,
      totalEscrito: json.totalEscrito != null && Number(json.totalEscrito) > 0 ? Math.round(Number(json.totalEscrito) * 100) / 100 : null,
      data,
      observacao: json.observacao ? String(json.observacao).trim().slice(0, 300) : null,
    };
  } catch (e) {
    erro = e instanceof Error ? e.message.slice(0, 300) : "falhou";
    throw e;
  } finally {
    // Custo no mesmo registro do Ajudante.
    try {
      await createAdminClient().from("ajudante_uso").insert({
        empresa_id: quem.empresaId,
        user_id: quem.userId,
        pergunta: `[notas] leitura de rascunho à mão (${fotos.length} foto(s))`,
        tela: "/notas",
        modelo: MODELO,
        tokens_entrada: Math.round(uso.entrada),
        tokens_saida: uso.saida,
        custo_usd: Math.round(((uso.entrada * PRECO.entrada + uso.saida * PRECO.saida) / 1e6) * 100000) / 100000,
        erro,
      });
    } catch { /* registrar o custo é extra */ }
  }
}
