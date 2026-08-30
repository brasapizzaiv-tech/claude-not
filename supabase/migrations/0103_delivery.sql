-- Delivery — Fase 1: pedido de delivery (envolve uma comanda p/ herdar itens,
-- pizzas, combos e impressão de cozinha), entregadores e config do delivery.
-- O ciclo de vida (status com horários) fica no delivery_pedidos; a comanda
-- segue 'aberta' até o pedido ser entregue/cancelado.

-- Entregadores (motoboys).
create table if not exists public.entregadores (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  telefone  text,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Pedido de delivery.
create table if not exists public.delivery_pedidos (
  id             uuid primary key default gen_random_uuid(),
  comanda_id     uuid references public.pdv_comandas (id) on delete set null,
  cliente_id     uuid references public.clientes (id) on delete set null,
  nome           text,
  telefone       text,
  tipo           text not null default 'entrega' check (tipo in ('entrega','retirada')),
  -- endereço (snapshot na hora do pedido)
  logradouro     text,
  numero         text,
  complemento    text,
  bairro         text,
  cidade         text,
  referencia     text,
  cep            text,
  lat            numeric,
  lng            numeric,
  distancia_km   numeric,
  -- valores
  taxa_entrega   numeric not null default 0,
  desconto       numeric not null default 0,
  desconto_motivo text,
  forma_pagamento text,
  troco_para     numeric,
  pago           boolean not null default false,
  -- origem e status
  origem         text not null default 'balcao' check (origem in ('app','whatsapp','instagram','telefone','balcao')),
  status         text not null default 'pendente' check (status in ('pendente','aceito','em_preparo','pronto','saiu','entregue','cancelado')),
  -- carimbos do fluxo
  criado_em      timestamptz not null default now(),
  aceito_em      timestamptz,
  preparo_em     timestamptz,
  pronto_em      timestamptz,
  saiu_em        timestamptz,
  entregue_em    timestamptz,
  cancelado_em   timestamptz,
  previsao_em    timestamptz,
  entregador_id  uuid references public.entregadores (id) on delete set null,
  atendente_id   uuid,
  observacao     text
);
create index if not exists idx_delivery_pedidos_status on public.delivery_pedidos (status);
create index if not exists idx_delivery_pedidos_criado on public.delivery_pedidos (criado_em desc);
create index if not exists idx_delivery_pedidos_comanda on public.delivery_pedidos (comanda_id);

-- Config do delivery (1 linha só; origem do restaurante, taxa por distância…).
create table if not exists public.delivery_config (
  id               int primary key default 1,
  origem_endereco  text,
  origem_lat       numeric,
  origem_lng       numeric,
  taxa_base        numeric not null default 0,
  preco_km         numeric not null default 0,
  raio_max_km      numeric,
  tempo_preparo_min int not null default 40,
  aberto           boolean not null default true,
  config           jsonb,
  atualizado_em    timestamptz not null default now(),
  constraint delivery_config_singleton check (id = 1)
);
insert into public.delivery_config (id) values (1) on conflict (id) do nothing;

-- Item pode ser escondido do delivery (sem efeito no painel interno v1).
alter table public.pdv_itens
  add column if not exists delivery boolean not null default true;

-- RLS: liberado para usuários autenticados (o painel roda logado).
alter table public.entregadores enable row level security;
alter table public.delivery_pedidos enable row level security;
alter table public.delivery_config enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='entregadores' and policyname='entregadores_all') then
    create policy entregadores_all on public.entregadores for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='delivery_pedidos' and policyname='delivery_pedidos_all') then
    create policy delivery_pedidos_all on public.delivery_pedidos for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='delivery_config' and policyname='delivery_config_all') then
    create policy delivery_config_all on public.delivery_config for all to authenticated using (true) with check (true);
  end if;
end $$;
