import type { SupabaseClient } from "@supabase/supabase-js";

// Ferramentas de CONSULTA do Ajudante (etapa 2). Cada uma é uma pergunta fixa
// ao banco que a IA pode fazer no meio da conversa. Regras de todas:
//  - Só LEEM (select / rpc de leitura). Nada de insert, update, delete.
//  - Usam o cliente da SESSÃO de quem está perguntando (RLS da empresa vale).
//  - Só aparecem pra IA se a pessoa pode abrir uma das `telas` no painel
//    (mesma regra do menu: podeAcessar). Assim ninguém vê pelo Ajudante o que
//    não vê pela tela.
//  - Período sempre limitado e resposta enxuta (somas e listas curtas): o que
//    volta vai pra IA, custa e precisa caber.
//  - Nada de dado pessoal de cliente (telefone, CPF, endereço, e-mail).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;

export type ContextoFerramenta = {
  empresaId: string;
  /** Hoje em Brasília, AAAA-MM-DD. */
  hoje: string;
};

export type EsquemaJson = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

export type Ferramenta = {
  /** snake_case, único. */
  nome: string;
  /** Pra IA: o que responde, quando usar, o que volta. Em português. */
  descricao: string;
  /** Rotas do painel; basta poder abrir UMA delas pra ferramenta valer. */
  telas: string[];
  parametros: EsquemaJson;
  /** Devolve um objeto pequeno, que vira JSON pra IA. Erro de uso: lance Error com frase pra pessoa. */
  executar: (db: Db, args: Record<string, unknown>, ctx: ContextoFerramenta) => Promise<unknown>;
};

/** Período AAAA-MM-DD validado: de ≤ ate, no máximo `maxDias` dias, nada no futuro além de hoje. */
export function periodo(args: Record<string, unknown>, ctx: ContextoFerramenta, maxDias = 93): { de: string; ate: string } {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const de = typeof args.de === "string" && re.test(args.de) ? args.de : ctx.hoje;
  let ate = typeof args.ate === "string" && re.test(args.ate) ? args.ate : de;
  if (ate > ctx.hoje) ate = ctx.hoje;
  if (de > ate) throw new Error("A data inicial é depois da final.");
  const dias = (Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000 + 1;
  if (dias > maxDias) throw new Error(`Período grande demais: no máximo ${maxDias} dias por consulta.`);
  return { de, ate };
}

/** Início e fim de um período de dias de Brasília (UTC−3), em ISO UTC, pra filtrar timestamptz. */
export function intervaloUtc(de: string, ate: string): { ini: string; fim: string } {
  const ini = new Date(Date.parse(`${de}T03:00:00Z`)).toISOString();
  const fim = new Date(Date.parse(`${ate}T03:00:00Z`) + 86400000 - 1).toISOString();
  return { ini, fim };
}

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
