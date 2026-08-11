-- Vincula cada categoria de produto a uma conta do DRE (para o CMV detalhado).
-- Assim, ao conferir um pedido, cada item cai na conta certa do DRE.
alter table public.categorias
  add column if not exists dre_categoria_id uuid
    references public.dre_categorias (id) on delete set null;
