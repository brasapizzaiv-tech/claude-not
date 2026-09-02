-- Catálogo PRÓPRIO de itens de etiqueta (preparações da cozinha: "Base Feijão",
-- "Carne Bovina Cozida"...), com categorias em botões e validade por conservação.
-- O cadastro de compras (produtos) é outra coisa (bebidas, limpeza, embalagens) e
-- fica só como vínculo opcional.
create table if not exists public.etiqueta_categorias (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null unique,
  ordem  int  not null default 0,
  ativo  boolean not null default true
);

create table if not exists public.etiqueta_itens (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  categoria_id       uuid references public.etiqueta_categorias (id) on delete set null,
  produto_id         uuid references public.produtos (id) on delete set null,
  validade_congelado int,
  validade_resfriado int,
  validade_ambiente  int,
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now()
);
create index if not exists idx_etiqueta_itens_cat on public.etiqueta_itens (categoria_id);

alter table public.etiquetas
  add column if not exists item_id        uuid references public.etiqueta_itens (id) on delete set null,
  add column if not exists categoria_nome text;

alter table public.etiqueta_categorias enable row level security;
alter table public.etiqueta_itens       enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='etiqueta_categorias' and policyname='etc_all') then
    create policy "etc_all" on public.etiqueta_categorias for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='etiqueta_itens' and policyname='eti_all') then
    create policy "eti_all" on public.etiqueta_itens for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Categorias iniciais (as mesmas que a cozinha já usa no sistema atual).
insert into public.etiqueta_categorias (nome, ordem) values
  ('Base Pratos', 1), ('Carne Bovina Crua', 2), ('Carne Bovina Cozida', 3),
  ('Carne Frango Crua', 4), ('Carne Frango Cozida', 5), ('Carne Suína Crua', 6),
  ('Carne Suína Cozida', 7), ('Peixes', 8), ('Peixe Cozido', 9),
  ('Frutos do Mar Cru', 10), ('Frutos do Mar Cozido', 11), ('Embutidos', 12),
  ('Molhos', 13), ('Massas', 14), ('Farinha', 15), ('Insumos Pizza', 16),
  ('Conserva', 17), ('Chocolates', 18)
on conflict (nome) do nothing;
