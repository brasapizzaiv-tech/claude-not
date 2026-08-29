-- Compras internas dos funcionários ("fiado" da equipe): catálogo de produtos
-- com preço + lançamentos ligados ao colaborador, com status aberto/pago.

create table if not exists public.retirada_produtos (
  id         bigint generated always as identity primary key,
  nome       text not null unique,
  categoria  text,
  preco      numeric not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table if not exists public.retiradas (
  id             bigint generated always as identity primary key,
  colaborador_id uuid references public.colaboradores (id) on delete set null,
  nome           text not null,                 -- nome da pessoa (denormalizado, p/ histórico)
  produto_id     bigint references public.retirada_produtos (id) on delete set null,
  item           text not null,                 -- descrição do item
  valor          numeric not null default 0,
  peso           numeric,                        -- kg, quando o item é por peso
  data           date not null,
  status         text not null default 'aberto' check (status in ('aberto', 'pago')),
  data_pagamento date,
  observacao     text,
  criado_por     uuid,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_retiradas_colaborador on public.retiradas (colaborador_id);
create index if not exists idx_retiradas_data on public.retiradas (data);
create index if not exists idx_retiradas_status on public.retiradas (status);

alter table public.retirada_produtos enable row level security;
alter table public.retiradas          enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='retirada_produtos' and policyname='retirada_produtos_all') then
    create policy retirada_produtos_all on public.retirada_produtos for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='retiradas' and policyname='retiradas_all') then
    create policy retiradas_all on public.retiradas for all to authenticated using (true) with check (true);
  end if;
end $$;
