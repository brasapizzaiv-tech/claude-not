-- Vincula cada item da nota a um produto do sistema (para o CMV detalhado).
alter table public.nota_itens
  add column if not exists produto_id uuid
    references public.produtos (id) on delete set null;
