-- Salão/PDV — Pizzas (montador): tamanhos, sabores e bordas, com preço por tamanho.

create table if not exists public.pdv_pizza_tamanhos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  max_sabores int  not null default 1,
  ordem       int  not null default 0
);

create table if not exists public.pdv_pizza_sabores (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null,
  ordem  int  not null default 0,
  ativo  boolean not null default true
);

create table if not exists public.pdv_pizza_sabor_precos (
  sabor_id   uuid not null references public.pdv_pizza_sabores (id) on delete cascade,
  tamanho_id uuid not null references public.pdv_pizza_tamanhos (id) on delete cascade,
  preco      numeric not null default 0,
  primary key (sabor_id, tamanho_id)
);

create table if not exists public.pdv_pizza_bordas (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null,
  ordem  int  not null default 0,
  ativo  boolean not null default true
);

create table if not exists public.pdv_pizza_borda_precos (
  borda_id   uuid not null references public.pdv_pizza_bordas (id) on delete cascade,
  tamanho_id uuid not null references public.pdv_pizza_tamanhos (id) on delete cascade,
  preco      numeric not null default 0,
  primary key (borda_id, tamanho_id)
);

do $$
declare t text;
begin
  foreach t in array array[
    'pdv_pizza_tamanhos','pdv_pizza_sabores','pdv_pizza_sabor_precos',
    'pdv_pizza_bordas','pdv_pizza_borda_precos'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      drop policy if exists "pdv_pizza_all" on public.%I;
      create policy "pdv_pizza_all" on public.%I for all to authenticated using (true) with check (true);
    $p$, t, t);
  end loop;
end $$;
