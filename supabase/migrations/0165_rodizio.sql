-- Quadro de pedidos do rodízio de pizzas (substitui o quadro na porta da
-- cozinha): garçom lança pelo app, cozinha vê na TV e marca no tablet.

-- Sabores: salgada/doce e se entra no rodízio (reaproveita o cadastro do cardápio).
alter table public.pdv_pizza_sabores
  add column if not exists tipo    text not null default 'salgada' check (tipo in ('salgada', 'doce')),
  add column if not exists rodizio boolean not null default true;

-- Pré-marca como doce o que tem cara de doce; o resto o Rafael acerta no cardápio.
update public.pdv_pizza_sabores set tipo = 'doce'
 where tipo = 'salgada' and (
   nome ilike '%doce%' or nome ilike '%chocolate%' or nome ilike '%brigadeiro%' or nome ilike '%nutella%'
   or nome ilike '%morango%' or nome ilike '%banana%' or nome ilike '%romeu%' or nome ilike '%prestígio%'
   or nome ilike '%prestigio%' or nome ilike '%bombom%' or nome ilike '%capuccino%' or nome ilike '%cappuccino%'
   or nome ilike '%sonho de valsa%' or nome ilike '%ovomaltine%' or nome ilike '%leite ninho%' or nome ilike '%kit kat%'
   or nome ilike '%m&m%' or nome ilike '%oreo%' or nome ilike '%churros%' or nome ilike '%abacaxi%' or nome ilike '%pistache%'
 );

-- Pedidos
create table if not exists public.pedidos_rodizio (
  id             uuid primary key default gen_random_uuid(),
  mesa           integer not null check (mesa between 1 and 46),
  sabor          text not null,
  sabor_id       uuid references public.pdv_pizza_sabores (id) on delete set null,
  tipo           text not null default 'salgada' check (tipo in ('salgada', 'doce')),
  fracao         text not null default 'inteira' check (fracao in ('inteira', 'meia', 'quarto')),
  quantidade     integer not null default 1 check (quantidade between 1 and 20),
  observacao     text,
  status         text not null default 'pendente' check (status in ('pendente', 'forno', 'pronto', 'cancelado')),
  criado_em      timestamptz not null default now(),
  forno_em       timestamptz,
  pronto_em      timestamptz,
  cancelado_em   timestamptz,
  colaborador_id uuid references public.colaboradores (id) on delete set null,
  garcom         text,                                    -- nome de quem lançou (fica no histórico)
  criado_por     uuid                                     -- usuário do painel, quando lançado por lá
);
create index if not exists pedidos_rodizio_fila on public.pedidos_rodizio (status, criado_em);
create index if not exists pedidos_rodizio_mesa on public.pedidos_rodizio (mesa, criado_em desc);

alter table public.pedidos_rodizio enable row level security;
do $$ begin
  -- Logados (painel/tablet) leem e mexem. O app do garçom e a TV passam pelo
  -- servidor (cliente administrativo), sem política pública.
  if not exists (select 1 from pg_policies where tablename='pedidos_rodizio' and policyname='pedidos_rodizio_auth') then
    create policy pedidos_rodizio_auth on public.pedidos_rodizio for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Realtime: o tablet da cozinha recebe cada mudança na hora.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='pedidos_rodizio') then
    alter publication supabase_realtime add table public.pedidos_rodizio;
  end if;
end $$;

-- Salão + deck = 46 mesas.
update public.pdv_config set valor = '46' where chave = 'qtd_mesas';
