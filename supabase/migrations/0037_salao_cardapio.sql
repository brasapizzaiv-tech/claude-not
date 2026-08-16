-- Módulo Salão/PDV — Fase 1a: cardápio + configurações (preço do buffet/kg).
-- Prefixo pdv_ (ponto de venda). Comandas/caixa virão nas próximas fases.

create table if not exists public.pdv_config (
  chave text primary key,
  valor text
);

create table if not exists public.pdv_itens (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  categoria  text,                          -- Pizzas, Bebidas, Porções...
  preco      numeric not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
create index if not exists idx_pdv_itens_cat on public.pdv_itens (categoria);

alter table public.pdv_config enable row level security;
alter table public.pdv_itens enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='pdv_config' and policyname='pdv_config_all') then
    create policy "pdv_config_all" on public.pdv_config for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='pdv_itens' and policyname='pdv_itens_all') then
    create policy "pdv_itens_all" on public.pdv_itens for all to authenticated using (true) with check (true);
  end if;
end $$;
