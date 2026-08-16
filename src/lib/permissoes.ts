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
  | "etiquetas"
  | "salao";

export const MODULOS: {
  key: ModuloKey;
  label: string;
  icon: string;
  rotas: string[];
}[] = [
  { key: "fornecedores", label: "Fornecedores", icon: "🚚", rotas: ["/fornecedores"] },
  { key: "produtos", label: "Produtos e Categorias", icon: "📦", rotas: ["/produtos", "/categorias"] },
  { key: "colaboradores", label: "Colaboradores", icon: "👤", rotas: ["/colaboradores"] },
  { key: "contagem", label: "Contagem de estoque", icon: "📋", rotas: ["/contagens"] },
  { key: "cotacoes", label: "Cotações", icon: "💰", rotas: ["/cotacoes"] },
  { key: "conferencia", label: "Conferência", icon: "📥", rotas: ["/conferencia"] },
  { key: "notas", label: "Notas Fiscais", icon: "🧾", rotas: ["/notas"] },
  { key: "financeiro", label: "Financeiro", icon: "📊", rotas: ["/financeiro"] },
  { key: "etiquetas", label: "Etiquetas", icon: "🏷️", rotas: ["/etiquetas"] },
  { key: "salao", label: "Salão / PDV", icon: "🍕", rotas: ["/salao"] },
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
  return permissoes.includes(mod);
}
