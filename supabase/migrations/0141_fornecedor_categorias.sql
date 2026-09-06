-- Categorias de PRODUTO que o fornecedor atende (ex.: Bebidas, Hortifruti).
-- Ao salvar, o sistema vincula o fornecedor a todos os produtos dessas
-- categorias (fornecedor_produto) — é isso que a cotação usa pra sugerir e
-- pra gerar os pedidos. Produto novo numa categoria já entra nos fornecedores dela.
alter table public.fornecedores
  add column if not exists categoria_ids uuid[] not null default '{}';
