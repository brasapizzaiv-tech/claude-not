// Tipos e constantes das saladas (fora do arquivo "use server", que só pode
// exportar funções assíncronas).
export const CATEGORIAS_SALADA = ["Folhas", "Maioneses", "Cozidas", "Cruas", "Grãos", "Conservas", "Outros"] as const;
export type CategoriaSalada = (typeof CATEGORIAS_SALADA)[number];
export type SaladaBase = { id: string; nome: string; categoria: CategoriaSalada };
