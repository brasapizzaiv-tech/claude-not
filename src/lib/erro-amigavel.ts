// Erro do banco em português (auditoria TXT-02, Onda 6).
//
// Antes, 150 lugares mandavam direto pra tela o texto técnico do Postgres ou
// da Supabase ("duplicate key value violates unique constraint…"). Aqui vira
// uma frase que a pessoa entende; o original vai pro log do servidor.
// Mensagem que JÁ é nossa (em português, sem cara de banco) passa como veio.

type ErroQualquer = { code?: string; message?: string; details?: string | null; hint?: string | null } | null | undefined;

const TECNICO = /violates|duplicate key|constraint|relation "|column "|syntax error|permission denied|row-level security|JWT|fetch failed|invalid input|null value|PGRST|timeout|ECONN|network|Failed to fetch/i;

/** A frase pra mostrar à pessoa. Sem erro → undefined. */
export function explicarErro(e: ErroQualquer): string;
export function explicarErro(e: ErroQualquer, padrao: string): string;
export function explicarErro(e: ErroQualquer, padrao?: string): string {
  if (!e) return padrao ?? "Não deu certo. Tente de novo.";
  const code = String(e.code ?? "");
  const msg = String(e.message ?? "");
  let frase: string | null = null;
  switch (code) {
    case "23505": frase = "Já existe um cadastro com esses dados."; break;
    case "23503": frase = "Está ligado a outro cadastro e não pode ser apagado ou trocado assim."; break;
    case "23502": frase = "Falta preencher um campo obrigatório."; break;
    case "23514": frase = "Algum valor está fora do permitido."; break;
    case "22P02": case "22007": case "22008": case "22003": frase = "Algum valor está num formato que não vale (data, número ou código)."; break;
    case "42501": frase = "Sem permissão para isso. Peça ao dono para liberar."; break;
    case "57014": frase = "Demorou demais e o banco desistiu. Tente de novo."; break;
    case "PGRST116": frase = "Não encontrei esse registro. Atualize a tela."; break;
    case "PGRST301": case "PGRST302": frase = "Seu acesso venceu. Entre de novo."; break;
  }
  if (!frase && /fetch failed|Failed to fetch|ECONN|network|timeout/i.test(msg)) frase = "Sem conexão com o servidor agora. Tente de novo em instantes.";
  if (!frase && msg && !TECNICO.test(msg)) return msg; // já é uma mensagem nossa
  if (msg) console.error("[erro do banco]", code || "-", msg, e.details ?? "", e.hint ?? "");
  return frase ?? padrao ?? "Não consegui gravar agora. Tente de novo; se repetir, avise.";
}
