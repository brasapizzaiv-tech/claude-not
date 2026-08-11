// Tipos das tabelas do banco (Módulo 1).

export type Papel = "dono" | "comprador" | "conferente";

export type Profile = {
  id: string;
  nome: string | null;
  papel: Papel;
  criado_em: string;
};

export type Fornecedor = {
  id: string;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  whatsapp: string | null;
  observacoes: string | null;
  ativo: boolean;
  criado_em: string;
};

export type Categoria = {
  id: string;
  nome: string;
};

export type Produto = {
  id: string;
  nome: string;
  unidade: string;
  categoria_id: string | null;
  estoque_minimo: number;
  observacoes: string | null;
  marca: string | null;
  aceita_similar: boolean;
  preco_referencia: number | null;
  codigo: string | null;
  ativo: boolean;
  criado_em: string;
  // Vem do join com categorias.
  categorias?: { nome: string } | null;
};
