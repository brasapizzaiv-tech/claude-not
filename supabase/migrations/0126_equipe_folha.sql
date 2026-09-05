-- Quadro de funcionários (planilha do Rafael): turno, aniversário, vínculo,
-- valores de freelance por turno, 10% da noite, uniforme. E a tabela de
-- PRESENÇAS (quem trabalhou em cada dia/turno) pra somar o que pagar e
-- dividir o 10% arrecadado na noite.
alter table public.colaboradores
  add column if not exists nascimento        date,
  add column if not exists turno             text not null default 'dia',
  add column if not exists vinculo           text not null default 'freelance',
  add column if not exists funcao            text,
  add column if not exists salario_base      numeric,
  add column if not exists valor_dia         numeric,
  add column if not exists valor_noite       numeric,
  add column if not exists recebe_10         boolean not null default false,
  add column if not exists peso_10           numeric not null default 1,
  add column if not exists filhos            boolean,
  add column if not exists conjuge           boolean,
  add column if not exists uniforme_estilo   text,
  add column if not exists uniforme_qtd      int,
  add column if not exists uniforme_tamanho  text,
  add column if not exists esporadico        boolean not null default false, -- free que vem de vez em quando (só aparece na semana quando é chamado)
  add column if not exists dias_dia          int[] not null default '{}',   -- escala fixa de DIA (0=dom..6=sáb)
  add column if not exists dias_noite        int[] not null default '{}';   -- escala fixa de NOITE

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'colaboradores_turno_check') then
    alter table public.colaboradores add constraint colaboradores_turno_check
      check (turno in ('dia', 'noite', 'ambos', 'proprietario'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'colaboradores_vinculo_check') then
    alter table public.colaboradores add constraint colaboradores_vinculo_check
      check (vinculo in ('clt', 'freelance'));
  end if;
end $$;

-- Presença: uma linha por pessoa × dia × turno em que trabalhou.
create table if not exists public.presencas (
  id             uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  data           date not null,
  turno          text not null check (turno in ('dia', 'noite')),
  criado_em      timestamptz not null default now(),
  unique (colaborador_id, data, turno)
);
create index if not exists idx_presencas_data on public.presencas (data);

-- 10% arrecadado em cada noite (por enquanto digitado à mão — o sistema ainda
-- não fecha todas as comandas). Pago semanalmente sobre a semana anterior.
create table if not exists public.dez_por_cento_noites (
  data       date primary key,
  valor      numeric not null default 0,
  obs        text,
  criado_em  timestamptz not null default now()
);
alter table public.dez_por_cento_noites enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='dez_por_cento_noites' and policyname='dez_all') then
    create policy "dez_all" on public.dez_por_cento_noites for all to authenticated using (true) with check (true);
  end if;
end $$;

alter table public.presencas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='presencas' and policyname='pres_all') then
    create policy "pres_all" on public.presencas for all to authenticated using (true) with check (true);
  end if;
end $$;
