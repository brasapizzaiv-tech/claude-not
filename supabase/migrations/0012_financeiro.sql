-- Módulo 4 — Financeiro / DRE

-- Plano de contas (baseado no DRE da Brasa). tipo define onde entra no DRE.
create table if not exists public.dre_categorias (
  id     uuid primary key default gen_random_uuid(),
  tipo   text not null check (tipo in (
           'receita','deducao','cmv','cmo','tarifa','imposto',
           'despesa_fixa','financeira','nao_operacional')),
  grupo  text not null,
  nome   text not null,
  ordem  int  not null default 0,
  ativo  boolean not null default true,
  unique (tipo, nome)
);

-- Lançamentos financeiros (receitas e despesas). valor sempre positivo;
-- o sinal no DRE vem do tipo da categoria.
create table if not exists public.lancamentos (
  id              uuid primary key default gen_random_uuid(),
  data            date not null default current_date,
  descricao       text,
  categoria_id    uuid references public.dre_categorias (id) on delete set null,
  valor           numeric not null default 0,
  forma_pagamento text,
  fornecedor_id   uuid references public.fornecedores (id) on delete set null,
  pedido_id       uuid references public.pedidos (id) on delete set null,
  origem          text not null default 'manual' check (origem in ('manual','pedido')),
  criado_em       timestamptz not null default now()
);

create index if not exists idx_lancamentos_data on public.lancamentos (data);
create index if not exists idx_lancamentos_pedido on public.lancamentos (pedido_id);

-- RLS: qualquer usuário logado (mesma política dos demais).
alter table public.dre_categorias enable row level security;
alter table public.lancamentos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='dre_categorias' and policyname='dre_cat_all') then
    create policy "dre_cat_all" on public.dre_categorias for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='lancamentos' and policyname='lanc_all') then
    create policy "lanc_all" on public.lancamentos for all to authenticated using (true) with check (true);
  end if;
end $$;
