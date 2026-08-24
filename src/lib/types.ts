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
  token: string | null;
  pin: string | null;
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
  estoque_ideal: number;
  fardo: number;
  validade_dias: number | null;
  validade_congelado: number | null;
  validade_resfriado: number | null;
  validade_ambiente: number | null;
  observacoes: string | null;
  marca: string | null;
  aceita_similar: boolean;
  preco_referencia: number | null;
  codigo: string | null;
  ativo: boolean;
  tem_st: boolean;
  st_pct_padrao: number | null;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  csosn: string | null;
  origem: string | null;
  criado_em: string;
  // Vem do join com categorias.
  categorias?: { nome: string } | null;
};

export type StatusCotacao = "aberta" | "fechada";

export type Cotacao = {
  id: string;
  descricao: string | null;
  contagem_id: string | null;
  data: string;
  prazo: string | null;
  status: StatusCotacao;
  criado_em: string;
};

export type CotacaoItem = {
  id: string;
  cotacao_id: string;
  produto_id: string;
  qtd: number;
};

export type CotacaoFornecedor = {
  id: string;
  cotacao_id: string;
  fornecedor_id: string;
  status: "enviado" | "respondido";
  token: string | null;
};

export type NotaFiscal = {
  id: string;
  chave: string;
  numero: string | null;
  serie: string | null;
  modelo: string | null;
  emit_cnpj: string | null;
  emit_nome: string | null;
  dest_cnpj: string | null;
  valor: number;
  data_emissao: string | null;
  vencimento: string | null;
  fornecedor_id: string | null;
  pedido_id: string | null;
  status: "importada" | "conciliada";
  tipo: "mercadoria" | "servico";
  dre_categoria_id: string | null;
  criado_em: string;
};

export type NotaItem = {
  id: string;
  nota_id: string;
  cprod: string | null;
  descricao: string | null;
  ncm: string | null;
  ean: string | null;
  unidade: string | null;
  qtd: number;
  valor_unit: number | null;
  valor_total: number | null;
  produto_id: string | null;
};

export type DreTipo =
  | "receita"
  | "deducao"
  | "cmv"
  | "cmo"
  | "tarifa"
  | "imposto"
  | "despesa_fixa"
  | "financeira"
  | "nao_operacional";

export type DreCategoria = {
  id: string;
  tipo: DreTipo;
  grupo: string;
  nome: string;
  ordem: number;
  ativo: boolean;
};

export type Lancamento = {
  id: string;
  data: string;
  descricao: string | null;
  categoria_id: string | null;
  valor: number;
  forma_pagamento: string | null;
  fornecedor_id: string | null;
  pedido_id: string | null;
  origem: "manual" | "pedido";
  vencimento: string | null;
  pago: boolean;
  pago_em: string | null;
  criado_em: string;
};

export type StatusPedido = "rascunho" | "enviado" | "recebido" | "conferido";

export type Pedido = {
  id: string;
  cotacao_id: string | null;
  fornecedor_id: string | null;
  data: string;
  status: StatusPedido;
  observacoes: string | null;
  conferido_em: string | null;
  criado_em: string;
};

export type PedidoItem = {
  id: string;
  pedido_id: string;
  produto_id: string;
  qtd: number;
  preco_unit: number | null;
  qtd_recebida: number | null;
  preco_recebido: number | null;
  obs: string | null;
};

export type CotacaoPreco = {
  id: string;
  cotacao_id: string;
  fornecedor_id: string;
  produto_id: string;
  preco_unit: number | null;
  disponivel: boolean;
  observacao: string | null;
};
