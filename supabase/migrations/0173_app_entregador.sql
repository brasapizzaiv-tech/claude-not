-- Delivery Etapa 4: app do entregador (link pessoal), GPS, ganhos e acerto do dia.
alter table public.entregadores
  add column if not exists token            text unique,
  add column if not exists valor_fixo_dia   numeric,   -- fixo por turno do almoço
  add column if not exists valor_fixo_noite numeric,   -- fixo por turno da noite
  add column if not exists valor_tele       numeric,   -- por entrega (a área pode ter o dela)
  add column if not exists ultima_lat       numeric,
  add column if not exists ultima_lng       numeric,
  add column if not exists ultima_pos_em    timestamptz;

-- Token dos que já existem (o app entra por /entrega/{token}).
update public.entregadores set token = encode(gen_random_bytes(12), 'hex') where token is null;

alter table public.delivery_pedidos
  add column if not exists taxa_motoboy    numeric,   -- quanto o boy ganha nesta entrega (fixado ao sair)
  add column if not exists recebido_forma  text,      -- o que o boy recebeu na porta: Dinheiro / Cartão / Pix / Já pago
  add column if not exists recebido_valor  numeric;

-- Rastro do dia (posição a cada ~15 s enquanto o app está aberto).
create table if not exists public.entregador_posicoes (
  id             bigserial primary key,
  entregador_id  uuid not null references public.entregadores (id) on delete cascade,
  lat            numeric not null,
  lng            numeric not null,
  precisao       numeric,
  em             timestamptz not null default now()
);
create index if not exists idx_entregador_posicoes_boy_em on public.entregador_posicoes (entregador_id, em desc);

-- Acerto (pagamento) do dia por entregador.
create table if not exists public.entregador_acertos (
  id                 uuid primary key default gen_random_uuid(),
  entregador_id      uuid not null references public.entregadores (id) on delete cascade,
  data               date not null,
  fixo               numeric not null default 0,
  teles_qtd          integer not null default 0,
  teles_valor        numeric not null default 0,
  total              numeric not null default 0,
  recebido_dinheiro  numeric not null default 0,
  recebido_cartao    numeric not null default 0,
  recebido_pix       numeric not null default 0,
  obs                text,
  criado_em          timestamptz not null default now(),
  unique (entregador_id, data)
);

alter table public.entregador_posicoes enable row level security;
alter table public.entregador_acertos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='entregador_posicoes' and policyname='entregador_posicoes_auth') then
    create policy entregador_posicoes_auth on public.entregador_posicoes for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='entregador_acertos' and policyname='entregador_acertos_auth') then
    create policy entregador_acertos_auth on public.entregador_acertos for all to authenticated using (true) with check (true);
  end if;
end $$;
