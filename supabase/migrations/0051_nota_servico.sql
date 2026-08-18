-- Nota de serviço: algumas notas baixadas são de serviço (não mercadoria).
-- tipo = 'mercadoria' (padrão) ou 'servico'. Quando serviço, o lançamento vai
-- inteiro para uma categoria de despesa do DRE (sem CMV por produto).
alter table public.notas_fiscais
  add column if not exists tipo text not null default 'mercadoria';

alter table public.notas_fiscais
  add column if not exists dre_categoria_id uuid
    references public.dre_categorias (id) on delete set null;
