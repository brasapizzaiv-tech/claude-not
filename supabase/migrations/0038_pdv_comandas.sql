-- Salão/PDV — Fase 1b: comandas (uma por pesagem) + itens lançados.
-- Configurações (preço/kg, buffet livre, serviço 10%) ficam em pdv_config.

create table if not exists public.pdv_comandas (
  id           uuid primary key default gen_random_uuid(),
  numero       bigint generated always as identity,
  status       text not null default 'aberta' check (status in ('aberta', 'fechada')),
  peso         numeric,                 -- kg pesados no buffet (se houver)
  valor_buffet numeric not null default 0,
  livre        boolean not null default false,
  aberta_em    timestamptz not null default now(),
  fechada_em   timestamptz,
  forma_pagamento text,
  servico      numeric not null default 0   -- valor do 10% aplicado no fechamento
);
create index if not exists idx_pdv_comandas_status on public.pdv_comandas (status);

create table if not exists public.pdv_comanda_itens (
  id          uuid primary key default gen_random_uuid(),
  comanda_id  uuid not null references public.pdv_comandas (id) on delete cascade,
  item_id     uuid references public.pdv_itens (id) on delete set null,
  descricao   text not null,
  qtd         numeric not null default 1,
  preco_unit  numeric not null default 0,
  criado_em   timestamptz not null default now()
);
create index if not exists idx_pdv_comanda_itens_com on public.pdv_comanda_itens (comanda_id);

alter table public.pdv_comandas enable row level security;
alter table public.pdv_comanda_itens enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='pdv_comandas' and policyname='pdv_comandas_all') then
    create policy "pdv_comandas_all" on public.pdv_comandas for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='pdv_comanda_itens' and policyname='pdv_comanda_itens_all') then
    create policy "pdv_comanda_itens_all" on public.pdv_comanda_itens for all to authenticated using (true) with check (true);
  end if;
end $$;
