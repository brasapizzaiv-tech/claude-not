-- Mapa das cubas do buffet (pedido do Rafael, 18/11/2026), da planilha
-- "FICHA TÉCNICA v04" (aba Cardápio): em cada cuba, quais pratos costumam ir,
-- por tipo de dia (seg–qui, sex–sáb, domingo), com quantas vezes saíram em
-- 2025. As "Ideias para este dia" usam isso pra sugerir POR CUBA o que faz
-- tempo que não sai ("na cuba das lasanhas faz 3 semanas que não sai a caprese").

create table if not exists public.cardapio_cubas (
  id bigint generated always as identity primary key,
  empresa_id uuid not null default public.empresa_atual() references public.empresas(id),
  cuba integer not null check (cuba between 1 and 60),
  nome_cuba text not null,
  tipo_dia text not null check (tipo_dia in ('semana', 'sexsab', 'domingo')),
  item_id uuid not null references public.cardapio_itens(id) on delete cascade,
  vezes integer not null default 0,
  criado_em timestamptz not null default now(),
  unique (empresa_id, cuba, tipo_dia, item_id)
);

create index if not exists cardapio_cubas_empresa on public.cardapio_cubas (empresa_id, tipo_dia, cuba);

alter table public.cardapio_cubas enable row level security;

drop policy if exists cardapio_cubas_empresa on public.cardapio_cubas;
create policy cardapio_cubas_empresa on public.cardapio_cubas
  for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());
