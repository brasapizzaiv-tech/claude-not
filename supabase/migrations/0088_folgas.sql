-- =====================================================================
-- SISTEMA DE FOLGAS (trazido do app HTML antigo para dentro do sistema).
-- Acesso do funcionário: link pessoal /folga/{token} (sem senha, PIN opcional),
-- sempre pelo servidor (nada de chave no navegador). Gestão: /folgas (logado).
-- =====================================================================

create table if not exists public.folgas_funcionarios (
  id          bigint generated always as identity primary key,
  nome        text not null unique,
  grupo       text not null check (grupo in ('almoco','entregaDia','cozinha','salao','entregaNoite')),
  vinculo     text not null default 'Freelance' check (vinculo in ('CLT','Freelance')),
  funcao      text,
  dias        smallint[],              -- 0=dom 1=seg ... 6=sab. null = sem escala
  grupo2      text check (grupo2 is null or grupo2 in ('almoco','entregaDia','cozinha','salao','entregaNoite')),
  dias2       smallint[],
  gerente     boolean not null default false,
  ativo       boolean not null default true,
  entrada_em  date not null default current_date,
  token       text unique,             -- link pessoal /folga/{token}
  pin         text,                    -- PIN opcional (definido pelo próprio)
  criado_em   timestamptz not null default now()
);

-- limite padrão por grupo e dia da semana. limite null = grupo não opera nesse dia
create table if not exists public.folgas_limites (
  grupo      text not null,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  limite     smallint,
  primary key (grupo, dia_semana)
);

-- limite específico de uma data, sobrepõe o padrão
create table if not exists public.folgas_ajustes (
  data   date not null,
  grupo  text not null,
  limite smallint not null check (limite >= 0),
  primary key (data, grupo)
);

create table if not exists public.folgas_bloqueios (
  data      date primary key,
  motivo    text not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.folgas_pedidos (
  id              bigint generated always as identity primary key,
  funcionario_id  bigint not null references public.folgas_funcionarios(id) on delete restrict,
  data            date not null,
  motivo          text,
  status          text not null default 'Pendente' check (status in ('Pendente','Aprovado','Negado')),
  motivo_negativa text,
  origem          text not null default 'app' check (origem in ('app','gestao')),
  grupo_alvo      text,                -- turno da folga; null = dia inteiro
  criado_em       timestamptz not null default now(),
  decidido_em     timestamptz
);

-- uma pessoa só pode ter um pedido vivo por data e turno (negado não conta)
create unique index if not exists folgas_pedidos_unico_vivo
  on public.folgas_pedidos (funcionario_id, data, coalesce(grupo_alvo, '*'))
  where status <> 'Negado';
create index if not exists folgas_pedidos_data_idx on public.folgas_pedidos (data);

-- limites padrão (mesmos do sistema antigo)
insert into public.folgas_limites (grupo, dia_semana, limite) values
  ('almoco',0,null),('almoco',1,3),('almoco',2,3),('almoco',3,3),('almoco',4,3),('almoco',5,2),('almoco',6,1),
  ('entregaDia',0,null),('entregaDia',1,1),('entregaDia',2,1),('entregaDia',3,1),('entregaDia',4,1),('entregaDia',5,1),('entregaDia',6,1),
  ('cozinha',0,null),('cozinha',1,null),('cozinha',2,null),('cozinha',3,2),('cozinha',4,2),('cozinha',5,1),('cozinha',6,0),
  ('salao',0,null),('salao',1,null),('salao',2,null),('salao',3,null),('salao',4,null),('salao',5,1),('salao',6,0),
  ('entregaNoite',0,null),('entregaNoite',1,null),('entregaNoite',2,null),('entregaNoite',3,null),('entregaNoite',4,null),('entregaNoite',5,1),('entregaNoite',6,1)
on conflict (grupo, dia_semana) do nothing;

-- Segurança: RLS liga. Só a gestão logada mexe direto; o app do funcionário
-- passa pelo servidor com o cliente admin (service role), validando o token.
alter table public.folgas_funcionarios enable row level security;
alter table public.folgas_limites      enable row level security;
alter table public.folgas_ajustes      enable row level security;
alter table public.folgas_bloqueios    enable row level security;
alter table public.folgas_pedidos      enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='folgas_funcionarios' and policyname='folgas_gestao') then
    create policy folgas_gestao on public.folgas_funcionarios for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='folgas_limites' and policyname='folgas_gestao') then
    create policy folgas_gestao on public.folgas_limites for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='folgas_ajustes' and policyname='folgas_gestao') then
    create policy folgas_gestao on public.folgas_ajustes for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='folgas_bloqueios' and policyname='folgas_gestao') then
    create policy folgas_gestao on public.folgas_bloqueios for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='folgas_pedidos' and policyname='folgas_gestao') then
    create policy folgas_gestao on public.folgas_pedidos for all to authenticated using (true) with check (true);
  end if;
end $$;
