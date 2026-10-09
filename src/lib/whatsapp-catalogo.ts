// Catálogo das campanhas e gatilhos do WhatsApp — sem nada de servidor, pra
// poder ser usado nas telas (componentes do navegador) e no motor.

export const VARIAVEIS = {
  nome: "Nome do cliente",
  link: "Link do cardápio",
  cupom: "Código do cupom",
  cashback_saldo: "Saldo de cashback",
  cashback_valor: "Valor do cashback (ganho ou vencendo)",
  cashback_vence: "Data em que o cashback vence",
  dias_sem: "Dias sem pedir",
  restaurante: "Nome do restaurante",
} as const;
export type Variavel = keyof typeof VARIAVEIS;

export type GatilhoDef = {
  chave: string;
  titulo: string;
  descricao: string;
  icone: string;
  marketing: boolean;               // categoria da Meta: marketing (mais caro) × utilidade
  dias?: { rotulo: string; padrao: number };
  variaveisSugeridas: Variavel[];
  exemplo: string;                  // texto sugerido pro modelo
};

export const GATILHOS: GatilhoDef[] = [
  { chave: "comprou", titulo: "Comprou", icone: "compras", marketing: false,
    descricao: "Mensagem sempre que um cliente tem um pedido entregue (delivery) ou uma compra no balcão com cliente vinculado.",
    variaveisSugeridas: ["nome", "link"],
    exemplo: "Oi {{1}}, obrigado pelo pedido! Se puder, conta pra gente o que achou: {{2}}" },
  { chave: "primeira_compra", titulo: "Primeira compra", icone: "estrela", marketing: false,
    descricao: "Mensagem na primeira compra do cliente com a gente.",
    variaveisSugeridas: ["nome", "link"],
    exemplo: "{{1}}, que bom ter você na Brasa! Obrigado pela primeira compra. Seu próximo pedido é por aqui: {{2}}" },
  { chave: "cupom", titulo: "Cupom", icone: "etiqueta", marketing: false,
    descricao: "Mensagem quando o cliente faz um pedido usando cupom.",
    variaveisSugeridas: ["nome", "cupom"],
    exemplo: "Oi {{1}}, você usou o cupom {{2}}. Obrigado pela preferência!" },
  { chave: "campanha", titulo: "Comprou de campanha", icone: "megafone", marketing: false,
    descricao: "Mensagem quando o cliente faz um pedido pelo link de uma campanha.",
    variaveisSugeridas: ["nome"],
    exemplo: "Oi {{1}}, obrigado por aproveitar nossa promoção!" },
  { chave: "cashback_ganho", titulo: "Cashback", icone: "presente", marketing: false,
    descricao: "Mensagem quando o cliente ganha cashback.",
    variaveisSugeridas: ["nome", "cashback_valor", "cashback_vence", "link"],
    exemplo: "{{1}}, você ganhou {{2}} de cashback! Use até {{3}} no próximo pedido: {{4}}" },
  { chave: "cashback_expira", titulo: "Expiração de cashback", icone: "ampulheta", marketing: true,
    dias: { rotulo: "Avisar quantos dias antes de vencer", padrao: 3 },
    descricao: "Mensagem quando o cashback do cliente está perto de vencer.",
    variaveisSugeridas: ["nome", "cashback_valor", "cashback_vence", "link"],
    exemplo: "{{1}}, seus {{2}} de cashback vencem em {{3}}. Não perca: {{4}}" },
  { chave: "inativo", titulo: "Inativo", icone: "desligado", marketing: true,
    dias: { rotulo: "Sem pedir há quantos dias", padrao: 30 },
    descricao: "Mensagem quando o cliente fica um tempo sem comprar.",
    variaveisSugeridas: ["nome", "link"],
    exemplo: "{{1}}, sentimos sua falta! Que tal uma pizza hoje? {{2}}" },
  { chave: "em_risco", titulo: "Em risco", icone: "alerta", marketing: true,
    descricao: "Mensagem quando um cliente que pedia com frequência (3 ou mais vezes) está demorando bem mais que o normal dele.",
    variaveisSugeridas: ["nome", "link"],
    exemplo: "Oi {{1}}, faz tempo que você não pede! Seu pedido de sempre está a um clique: {{2}}" },
  { chave: "nunca_comprou", titulo: "Nunca comprou", icone: "pessoa", marketing: true,
    dias: { rotulo: "Quantos dias depois do cadastro", padrao: 3 },
    descricao: "Mensagem pra quem se cadastrou e ainda não fez pedido. Vale só pra cadastros novos; a base antiga vai por campanha.",
    variaveisSugeridas: ["nome", "link"],
    exemplo: "{{1}}, que tal fazer seu primeiro pedido na Brasa? {{2}}" },
  { chave: "aniversario", titulo: "Aniversariante", icone: "festa", marketing: true,
    dias: { rotulo: "Quantos dias antes do aniversário (0 = no dia)", padrao: 0 },
    descricao: "Mensagem no aniversário do cliente (só de quem informou a data e aceitou receber).",
    variaveisSugeridas: ["nome", "cupom", "link"],
    exemplo: "Parabéns, {{1}}! Pra comemorar, use o cupom {{2}} no seu pedido: {{3}}" },
];

export const PUBLICOS = {
  todos: "Todos os clientes com WhatsApp",
  nunca: "Quem nunca comprou",
  recentes: "Quem comprou nos últimos X dias",
  inativos: "Quem não compra há mais de X dias",
  frequentes: "Quem já comprou X vezes ou mais",
  cashback: "Quem tem saldo de cashback",
} as const;
export type TipoPublico = keyof typeof PUBLICOS;


export const STATUS_CAMPANHA: Record<string, { rotulo: string; cor: string }> = {
  rascunho: { rotulo: "Rascunho", cor: "text-texto-suave" },
  agendada: { rotulo: "Aguardando horário", cor: "text-amber-600" },
  enviando: { rotulo: "Enviando", cor: "text-sky-600" },
  pausada: { rotulo: "Pausada", cor: "text-amber-600" },
  concluida: { rotulo: "Concluída", cor: "text-emerald-600" },
  cancelada: { rotulo: "Cancelada", cor: "text-texto-fraco" },
};
