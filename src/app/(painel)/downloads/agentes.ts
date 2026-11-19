// Instaladores dos agentes (bucket privado "instaladores", migration 0285).
// Quem sobe é o scripts/publicar-instaladores.mjs; quem entrega é
// /impressao/downloads/baixar (link assinado de 10 minutos).
export const AGENTES = [
  {
    arquivo: "AgenteImpressao-Setup.exe",
    nome: "Agente de impressão",
    onde: "PC central (o do escritório)",
    texto: "Imprime etiquetas, comandas da cozinha, cupom da NFC-e e marmitas. Também lê o relógio de ponto.",
  },
  {
    arquivo: "AgenteBalanca-Setup.exe",
    nome: "Agente da balança",
    onde: "PC da balança do buffet",
    texto: "Lê o peso da balança e imprime o cupom do buffet.",
  },
  {
    arquivo: "AgenteTEF-Setup.exe",
    nome: "Agente do pinpad (TEF)",
    onde: "Cada PC de caixa com pinpad",
    texto: "Liga o caixa e o PDV ao pinpad pelo gerenciador da Elgin.",
  },
] as const;

export type IndiceAgentes = Record<string, { versao: string; mb: number; em: string }>;
