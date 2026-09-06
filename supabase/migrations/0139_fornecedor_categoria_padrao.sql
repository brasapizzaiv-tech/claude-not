-- Categoria (DRE) e tipo de nota PADRÃO do fornecedor: ao vincular/importar uma
-- nota dele, a categoria e o tipo (mercadoria/serviço) já vêm preenchidos.
alter table public.fornecedores
  add column if not exists dre_categoria_id uuid references public.dre_categorias (id) on delete set null,
  add column if not exists tipo_nota text check (tipo_nota is null or tipo_nota in ('mercadoria', 'servico'));
