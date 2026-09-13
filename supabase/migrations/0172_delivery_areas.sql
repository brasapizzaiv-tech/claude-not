-- Delivery Etapa 3: áreas de entrega desenhadas no mapa (valor por área) e
-- promoções da taxa de entrega (grátis / % / R$) por área, dia e pedido mínimo.
create table if not exists public.delivery_areas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  cor           text not null default '#C78340',
  valor         numeric not null default 0,      -- taxa cobrada do cliente
  taxa_motoboy  numeric,                          -- o que o entregador ganha nessa área (Etapa 4)
  tempo_min     integer,                          -- tempo estimado de entrega (opcional)
  poligono      jsonb not null default '[]',      -- [[lat,lng], ...]
  ordem         integer not null default 0,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create table if not exists public.delivery_promocoes_tele (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  tipo           text not null check (tipo in ('gratis','percent','valor')),
  valor          numeric not null default 0,     -- % ou R$ de desconto na taxa
  area_ids       uuid[],                          -- null = todas as áreas
  pedido_minimo  numeric,                         -- null = qualquer valor
  dias           integer[],                       -- null = todos os dias (0 = domingo)
  hora_ini       text,                            -- "18:30" (opcional)
  hora_fim       text,                            -- "22:00" (opcional)
  validade       date,                            -- null = sem prazo
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now()
);

alter table public.delivery_pedidos
  add column if not exists area_id     uuid references public.delivery_areas (id) on delete set null,
  add column if not exists area_nome   text,
  add column if not exists taxa_motivo text;      -- ex.: "Entrega grátis (quarta)"

alter table public.delivery_areas enable row level security;
alter table public.delivery_promocoes_tele enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='delivery_areas' and policyname='delivery_areas_auth') then
    create policy delivery_areas_auth on public.delivery_areas for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='delivery_promocoes_tele' and policyname='delivery_promocoes_tele_auth') then
    create policy delivery_promocoes_tele_auth on public.delivery_promocoes_tele for all to authenticated using (true) with check (true);
  end if;
end $$;
