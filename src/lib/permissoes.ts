import type { NomeIcone } from "@/components/icone";

// Fonte única dos módulos do sistema e do controle de acesso.
// Usado pelo menu (sidebar), pela página de Usuários e pelo bloqueio de rotas
// no middleware. Sem imports de servidor para poder rodar no Edge.

export type ModuloKey =
  | "fornecedores"
  | "produtos"
  | "colaboradores"
  | "contagem"
  | "cotacoes"
  | "conferencia"
  | "notas"
  | "financeiro"
  | "contas"
  | "etiquetas"
  | "garcom"
  | "salao"
  | "recepcao"
  | "reservas"
  | "cardapio_dia"
  | "folgas"
  | "retiradas"
  | "impressao"
  | "pdv"
  | "delivery"
  | "solicitacoes"
  | "checklists"
  | "mural"
  | "feriados"
  | "rodizio";

// `icon` é o NOME do ícone, não o desenho: quem desenha é o <Icone> em
// src/components/icone.tsx. Fica como texto porque este arquivo também roda no
// middleware, onde não existe React.
export const MODULOS: {
  key: ModuloKey;
  label: string;
  icon: NomeIcone;
  rotas: string[];
}[] = [
  { key: "fornecedores", label: "Fornecedores", icon: "caminhao", rotas: ["/fornecedores"] },
  { key: "produtos", label: "Produtos e Categorias", icon: "pacote", rotas: ["/produtos", "/categorias"] },
  { key: "colaboradores", label: "Colaboradores", icon: "pessoa", rotas: ["/colaboradores"] },
  { key: "contagem", label: "Contagem de estoque", icon: "lista", rotas: ["/contagens"] },
  { key: "cotacoes", label: "Cotações", icon: "moedas", rotas: ["/cotacoes"] },
  { key: "conferencia", label: "Conferência", icon: "entrada", rotas: ["/conferencia"] },
  { key: "notas", label: "Notas Fiscais", icon: "cupom", rotas: ["/notas"] },
  // Contas a pagar sozinha (dar baixa nos boletos) — vem ANTES de "financeiro"
  // para /financeiro/contas ser controlada por esta permissão (mais específica).
  { key: "contas", label: "Contas a pagar (só baixa de boletos)", icon: "documento", rotas: ["/financeiro/contas"] },
  { key: "financeiro", label: "Financeiro (completo)", icon: "grafico", rotas: ["/financeiro"] },
  { key: "etiquetas", label: "Etiquetas", icon: "etiqueta", rotas: ["/etiquetas"] },
  // Garçom: só o app do garçom (/garcom). Vem ANTES de "salao" para que /garcom
  // seja controlado por esta permissão (mais específica).
  { key: "garcom", label: "Garçom (app do celular)", icon: "cozinha", rotas: ["/garcom"] },
  { key: "salao", label: "Salão / PDV", icon: "pizza", rotas: ["/salao"] },
  // Recepção: só a tela de celular das reservas. Vem ANTES de "reservas" para
  // que /reservas/hoje seja controlada por esta permissão (mais específica).
  { key: "recepcao", label: "Recepção (reservas no celular)", icon: "celular", rotas: ["/reservas/hoje"] },
  { key: "reservas", label: "Reservas", icon: "agenda", rotas: ["/reservas"] },
  { key: "cardapio_dia", label: "Cardápio do dia (site)", icon: "salao", rotas: ["/cardapio-do-dia"] },
  { key: "folgas", label: "Folgas (gestão)", icon: "folga", rotas: ["/folgas"] },
  { key: "retiradas", label: "Compras internas", icon: "compras", rotas: ["/retiradas"] },
  { key: "impressao", label: "Central de Impressões", icon: "imprimir", rotas: ["/impressao"] },
  { key: "pdv", label: "PDV (balcão)", icon: "cupom", rotas: ["/pdv"] },
  { key: "delivery", label: "Delivery", icon: "entrega", rotas: ["/delivery"] },
  { key: "solicitacoes", label: "Pedidos da equipe (compras e manutenção)", icon: "ferramenta", rotas: ["/solicitacoes"] },
  { key: "checklists", label: "Checklists de rotina", icon: "checklist", rotas: ["/checklists"] },
  { key: "mural", label: "Mural do escritório", icon: "aparelho", rotas: ["/mural"] },
  { key: "feriados", label: "Feriados e datas especiais", icon: "agenda", rotas: ["/feriados"] },
  { key: "rodizio", label: "Quadro do rodízio (cozinha)", icon: "pizza", rotas: ["/cozinha"] },
];

// Qual módulo "controla" a rota. "usuarios" é só do dono. null = rota livre
// para qualquer logado (ex.: /dashboard).
export function moduloDaRota(path: string): ModuloKey | "usuarios" | null {
  if (path === "/usuarios" || path.startsWith("/usuarios/")) return "usuarios";
  for (const m of MODULOS) {
    for (const r of m.rotas) {
      if (path === r || path.startsWith(r + "/")) return m.key;
    }
  }
  return null;
}

export function podeAcessar(
  path: string,
  admin: boolean,
  permissoes: string[],
): boolean {
  if (admin) return true;
  const mod = moduloDaRota(path);
  if (mod === null) return true; // rota livre (dashboard etc.)
  if (mod === "usuarios") return false; // só o dono
  // Quem tem acesso ao Salão também usa o app do garçom.
  if (mod === "garcom") return permissoes.includes("garcom") || permissoes.includes("salao");
  // Quem tem o Financeiro completo também abre as Contas a pagar.
  if (mod === "contas") return permissoes.includes("contas") || permissoes.includes("financeiro");
  return permissoes.includes(mod);
}
