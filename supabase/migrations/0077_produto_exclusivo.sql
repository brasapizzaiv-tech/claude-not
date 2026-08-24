-- Produto exclusivo: comprado de um único fornecedor. Na cotação vai só pra ele.
-- Serve de trava/etiqueta no cadastro (não deixa marcar 2 fornecedores).
alter table public.produtos
  add column if not exists exclusivo boolean not null default false;
