import type { Db, ContextoFerramenta, EsquemaJson } from "../ferramentas/tipos";

// AÇÕES do Ajudante (etapa 3). A IA nunca executa nada sozinha:
//  1. Ela chama a ação → o servidor roda `preparar` (só LÊ: acha os ids pelos
//     nomes, confere se faz sentido) e guarda o pedido em ajudante_acoes.
//  2. A conversa mostra um cartão com `resumo` e `detalhes` e os botões
//     "Confirmar" / "Cancelar".
//  3. Só o clique da pessoa em "Confirmar" chama `executar`, que usa a MESMA
//     função (server action) da tela do painel — mesmas travas e permissões.
// Por enquanto só o dono usa ações. Dinheiro (caixa, contas, pagamentos,
// notas fiscais) nunca entra aqui.

export type AcaoPreparada = {
  /** Uma frase: o que vai acontecer. Ex.: "Aprovar a folga de Fulana no sábado, 22/11". */
  resumo: string;
  /** Linhas curtas de conferência (quem, quando, valores). Até ~8. */
  detalhes: string[];
  /** Tudo que `executar` precisa, já resolvido (ids, datas). Vai pro banco como JSON. */
  dados: Record<string, unknown>;
};

export type Acao = {
  /** snake_case, começa com "acao_". */
  nome: string;
  /** Pra IA: o que faz, quando usar e o que precisa saber antes. Em português. */
  descricao: string;
  /** Rotas do painel; basta poder abrir UMA delas. */
  telas: string[];
  parametros: EsquemaJson;
  /** Só lê (cliente da sessão). Resolve nomes → ids e valida. Problema de uso: lance Error com frase pra pessoa. */
  preparar: (db: Db, args: Record<string, unknown>, ctx: ContextoFerramenta) => Promise<AcaoPreparada>;
  /** Executa de verdade com os `dados` do preparar, chamando a função da tela. Devolve a frase do que foi feito. Falhou: lance Error com frase. */
  executar: (dados: Record<string, unknown>, ctx: ContextoFerramenta) => Promise<string>;
};

/** FormData a partir de um objeto simples (as server actions do painel recebem FormData). */
export function formData(campos: Record<string, string | number | boolean | null | undefined | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) {
    if (v == null) continue;
    if (Array.isArray(v)) for (const x of v) fd.append(k, x);
    else fd.append(k, typeof v === "boolean" ? (v ? "on" : "") : String(v));
  }
  return fd;
}

/** Texto obrigatório dos argumentos da IA (tirado o espaço). */
export function texto(args: Record<string, unknown>, campo: string, minimo = 1): string {
  const v = typeof args[campo] === "string" ? (args[campo] as string).trim() : "";
  if (v.length < minimo) throw new Error(`Falta informar ${campo.replace(/_/g, " ")}.`);
  return v;
}

/** Data AAAA-MM-DD → "sáb, 22/11". */
export function dataCurta(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dia = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d.getUTCDay()];
  return `${dia}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
