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
  | "cmv"
  | "financeiro"
  | "contas"
  | "cofre"
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
  | "lembretes"
  | "rodizio"
  | "fichas";

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
  // CMV / Consumo sozinho (19/11/2026): quem vende só Compras e estoque precisa
  // do CMV sem abrir o resto do financeiro. Vem ANTES de "financeiro" pelo mesmo
  // motivo das Contas a pagar; quem tem o Financeiro completo continua vendo.
  { key: "cmv", label: "CMV / Consumo (só o relatório)", icon: "descendo", rotas: ["/financeiro/cmv"] },
  { key: "financeiro", label: "Financeiro (completo)", icon: "grafico", rotas: ["/financeiro"] },
  { key: "cofre", label: "Cofre (dinheiro em espécie)", icon: "cofre", rotas: ["/cofre"] },
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
  { key: "feriados", label: "Feriados e eventos", icon: "agenda", rotas: ["/feriados"] },
  { key: "lembretes", label: "Lembretes pra equipe", icon: "sino", rotas: ["/lembretes"] },
  { key: "rodizio", label: "Tablet da cozinha (delivery e rodízio)", icon: "pizza", rotas: ["/cozinha"] },
  // Fichas técnicas: receitas e custo dos pratos (0320). A chefe no celular não vê custo.
  { key: "fichas", label: "Fichas técnicas (custo dos pratos)", icon: "caderno", rotas: ["/fichas-tecnicas"] },
];

// Rotas só do dono. A configuração fiscal guarda o token da Focus e o CSC, e as
// formas de pagamento mudam o caixa de todo mundo (auditoria, 08/11/2026: antes
// qualquer funcionário logado abria /fiscal e salvava). /notas/sefaz guarda o
// certificado A1 (SEC-03): a busca de notas segue pra quem tem "notas".
const SO_DONO = ["/usuarios", "/fiscal", "/formas-pagamento", "/aparencia", "/notas/sefaz", "/sugestoes"];

// Cadastro de clientes (CPF, telefone, endereço): quem vende e quem fatura.
const ROTAS_CLIENTES = ["/clientes"];
export const PERMISSOES_CLIENTES: ModuloKey[] = ["salao", "pdv", "delivery", "financeiro"];

const naRota = (path: string, r: string) => path === r || path.startsWith(r + "/");

// Qual módulo "controla" a rota. "usuarios" é só do dono. null = rota livre
// para qualquer logado (ex.: /dashboard).
export function moduloDaRota(path: string): ModuloKey | "usuarios" | "clientes" | null {
  if (SO_DONO.some((r) => naRota(path, r))) return "usuarios";
  if (ROTAS_CLIENTES.some((r) => naRota(path, r))) return "clientes";
  for (const m of MODULOS) {
    for (const r of m.rotas) {
      if (path === r || path.startsWith(r + "/")) return m.key;
    }
  }
  return null;
}

// ---------- Módulos da EMPRESA (o que ela contratou) ----------
// As permissões acima são por PESSOA. Esta lista é por EMPRESA (19/11/2026, pra
// vender só alguns módulos): o que a empresa não contratou some do menu e as
// telas dele ficam fechadas até pro dono. Mora em `empresas.modulos`
// (migration 0322); NULL = todos os módulos (a Brasa). Só a chave
// administrativa grava (a tabela não tem política de escrita), então o cliente
// não liga módulo sozinho.
export type ModulosEmpresa = readonly string[] | null;

/** A empresa contratou este módulo? (NULL = tudo contratado.) */
export function empresaTem(modulos: ModulosEmpresa | undefined, key: ModuloKey): boolean {
  return !modulos || modulos.includes(key);
}

// Telas só do dono que pertencem a um módulo: sem o módulo, nem o dono vê.
// (Usuários, Aparência e Sugestões valem pra toda empresa.)
const DONO_POR_MODULO: { rota: string; modulos: ModuloKey[] }[] = [
  { rota: "/fiscal", modulos: ["salao", "pdv", "delivery"] },
  { rota: "/formas-pagamento", modulos: ["salao", "pdv", "delivery"] },
  { rota: "/notas/sefaz", modulos: ["notas"] },
];

export function podeAcessar(
  path: string,
  admin: boolean,
  permissoes: string[],
  modulos: ModulosEmpresa = null,
): boolean {
  const mod = moduloDaRota(path);
  if (mod === null) return true; // rota livre (dashboard etc.)
  // A pessoa pode E a empresa contratou.
  const tem = (k: ModuloKey) => empresaTem(modulos, k) && (admin || permissoes.includes(k));
  if (mod === "usuarios") {
    if (!admin) return false; // só o dono
    const regra = DONO_POR_MODULO.find((d) => naRota(path, d.rota));
    return !regra || regra.modulos.some((k) => empresaTem(modulos, k));
  }
  if (mod === "clientes") return PERMISSOES_CLIENTES.some(tem);
  // Quem tem acesso ao Salão também usa o app do garçom.
  if (mod === "garcom") return tem("garcom") || tem("salao");
  // Quem tem o Financeiro completo também abre as Contas a pagar e o CMV.
  if (mod === "contas") return tem("contas") || tem("financeiro");
  if (mod === "cmv") return tem("cmv") || tem("financeiro");
  return tem(mod);
}
