-- PRÊMIO ASSIDUIDADE (quem bate ponto no relógio — migration 0221)
--
-- Regras do Rafael (10/10/2026):
--  - R$ 100 por mês cumprido; paga a cada 3 meses (trimestre do calendário),
--    no acerto da semana (Semana e 10%).
--  - Tolerância: até 15 minutos de atraso SOMADOS no mês (5 min em 3 dias já
--    esgota). Passou, perde o mês.
--  - Falta, folga pedida no app (aprovada) ou atestado no mês: perde o mês.
--  - Horário de entrada: o "Horário Restaurante" do RHiD — seg a sáb, 08:00.
-- A conta mora em src/lib/assiduidade-core.ts (testada).
create table if not exists public.assiduidade_config (
  empresa_id     uuid primary key default public.empresa_atual() references public.empresas (id),
  ativo          boolean not null default true,
  valor_mes      numeric(10,2) not null default 100,
  tolerancia_min integer not null default 15,
  -- Entrada do turno do dia por dia da semana (0=dom ... 6=sáb). Sem chave = não trabalha.
  entradas       jsonb not null default '{"1":"08:00","2":"08:00","3":"08:00","4":"08:00","5":"08:00","6":"08:00"}',
  dia_inicio_mes integer not null default 1 check (dia_inicio_mes between 1 and 28),
  inicio         date,          -- a partir de quando conta (o relógio começou a valer)
  atualizado_em  timestamptz not null default now()
);

-- Atestados (perde o prêmio do mês, mas não é falta).
create table if not exists public.atestados (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  inicio         date not null,
  fim            date not null,
  motivo         text,
  arquivo_url    text,
  criado_em      timestamptz not null default now(),
  check (fim >= inicio)
);
create index if not exists atestados_colab_idx on public.atestados (colaborador_id, inicio);

-- O que já foi pago (um por pessoa e trimestre, pra não pagar duas vezes).
create table if not exists public.assiduidade_pagamentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  trimestre      text not null,          -- "2026-T4"
  meses          integer not null,
  valor          numeric(10,2) not null,
  segunda        date not null,          -- semana do acerto em que entrou
  criado_em      timestamptz not null default now(),
  unique (colaborador_id, trimestre)
);

alter table public.assiduidade_config enable row level security;
alter table public.atestados enable row level security;
alter table public.assiduidade_pagamentos enable row level security;
do $$
declare t text;
begin
  foreach t in array array['assiduidade_config', 'atestados', 'assiduidade_pagamentos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_empresa', t);
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual())', t || '_empresa', t);
  end loop;
end $$;
grant select, insert, update, delete on public.assiduidade_config, public.atestados, public.assiduidade_pagamentos to authenticated, service_role;

-- Começa valendo na segunda 12/10/2026 (o relógio ainda não tinha batidas em 10/10).
insert into public.assiduidade_config (empresa_id, inicio)
values ('00000000-0000-4000-8000-000000000001', '2026-10-12')
on conflict (empresa_id) do nothing;
