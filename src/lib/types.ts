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

export type Colaborador = {
  id: string;
  nome: string;
  whatsapp: string | null;
  ativo: boolean;
  criado_em: string;
};

export type StatusContagem = "rascunho" | "finalizada";

export type Contagem = {
  id: string;
  descricao: string | null;
  data: string;
  responsavel_id: string | null;
  status: StatusContagem;
  criado_em: string;
};

export type ContagemItem = {
  id: string;
  contagem_id: string;
  produto_id: string;
  qtd_estoque: number;
  qtd_pedir: number;
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
