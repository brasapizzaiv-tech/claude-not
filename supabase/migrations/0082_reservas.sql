-- Reservas de mesa: sai do Supabase avulso do site e passa a morar aqui, junto
-- com o resto do sistema. O site publico grava pela rota /api/reservas (sem
-- chave nenhuma no HTML) e a equipe atende pelo painel /reservas, com o login
-- que ja usa.

create table if not exists public.reservas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  telefone    text not null,
  data        date not null,
  turno       text not null,               -- 'Almoço' | 'Rodízio'
  chegada     text,                        -- horario previsto de chegada
  pessoas     int  not null default 1,
  adultos     int,
  criancas    int  not null default 0,
  lugar       text,                         -- 'Tanto faz' | 'Salão' | 'Deck'
  mesa        text,
  ocasiao     text,
  nascimento  date,
  observacao  text,
  status      text not null default 'nova'
              check (status in ('nova','aguardando','confirmada','cancelada')),
  origem      text not null default 'site' check (origem in ('site','interno')),
  chegou_em   timestamptz,
  criado_em   timestamptz not null default now()
);
create index if not exists reservas_data_idx on public.reservas (data);
create index if not exists reservas_status_idx on public.reservas (status);

-- Dias (ou turnos) fechados para reserva.
create table if not exists public.reservas_bloqueios (
  id        uuid primary key default gen_random_uuid(),
  data      date not null,
  turno     text not null,                 -- 'Dia todo' | 'Almoço' | 'Rodízio'
  motivo    text,
  criado_em timestamptz not null default now()
);
create index if not exists reservas_bloqueios_data_idx on public.reservas_bloqueios (data);

-- Lotacao maxima por turno (o site para de aceitar quando enche).
create table if not exists public.reservas_limites (
  turno         text primary key,
  max_reservas  int not null default 30,
  max_pessoas   int not null default 120,
  grupo_grande  int not null default 12
);

-- Modelos de mensagem do WhatsApp ({nome}, {data}, {turno}, {pessoas}).
create table if not exists public.reservas_config (
  chave text primary key,
  valor text
);

alter table public.reservas            enable row level security;
alter table public.reservas_bloqueios  enable row level security;
alter table public.reservas_limites    enable row level security;
alter table public.reservas_config     enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='reservas' and policyname='reservas_all') then
    create policy "reservas_all" on public.reservas for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='reservas_bloqueios' and policyname='reservas_bloq_all') then
    create policy "reservas_bloq_all" on public.reservas_bloqueios for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='reservas_limites' and policyname='reservas_lim_all') then
    create policy "reservas_lim_all" on public.reservas_limites for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='reservas_config' and policyname='reservas_cfg_all') then
    create policy "reservas_cfg_all" on public.reservas_config for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Limites atuais (os mesmos que estavam valendo no site).
insert into public.reservas_limites (turno, max_reservas, max_pessoas, grupo_grande)
values ('Almoço', 30, 120, 12), ('Rodízio', 30, 95, 12)
on conflict (turno) do nothing;

insert into public.reservas_config (chave, valor) values
  ('msg_confirmacao', 'Oi {nome}! Sua reserva no Brasa está confirmada para {data}, no {turno}, para {pessoas} pessoa(s). Até lá!'),
  ('msg_aguardando',  'Oi {nome}! Recebemos seu pedido de reserva para {data} ({turno}, {pessoas} pessoas). Estamos conferindo as mesas e já confirmamos com você.'),
  ('msg_sem_mesa',    'Oi {nome}! Infelizmente não temos mesa disponível para {data} no {turno}. Podemos ver outro dia ou horário?')
on conflict (chave) do nothing;
