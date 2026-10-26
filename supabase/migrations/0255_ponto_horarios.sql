-- HORÁRIOS DE TRABALHO (Rafael, 26/10/2026: sair do RHiD). Igual ao "Config.
-- de Horário" do RHiD: cada horário tem nome, até dois períodos por dia
-- (Entrada 1/Saída 1/Entrada 2/Saída 2), almoço livre (vale a duração do
-- intervalo, não a hora), dia compensado, dia neutro, tolerâncias e o horário
-- noturno. Cada pessoa fica num horário a partir de uma data (histórico), com
-- exceção por dia. Quem não tem horário segue nas regras antigas
-- (assiduidade_config.entradas/saidas + colaboradores.dias_dia).
--
-- dias: {"1": {"p": [["08:00","14:00"]], "almoco_livre": false, "compensado": false, "neutro": false}, ...}
-- (chave = dia da semana, 0 = domingo; sem a chave ou sem "p" = folga)
create table if not exists public.ponto_horarios (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null default public.empresa_atual() references public.empresas (id),
  nome             text not null,
  ativo            boolean not null default true,
  dias             jsonb not null default '{}',
  tolerancia_extra integer not null default 5,   -- por batida (CLT art. 58)
  tolerancia_falta integer not null default 5,
  limite_extra     integer not null default 10,  -- passou disso no dia, conta tudo
  limite_falta     integer not null default 10,
  noturno_inicio   text not null default '22:00',
  noturno_fim      text not null default '05:00',
  criado_em        timestamptz not null default now()
);
create index if not exists ponto_horarios_empresa_idx on public.ponto_horarios (empresa_id, ativo);

-- Em qual horário a pessoa está, de quando até quando (ate null = até hoje).
create table if not exists public.colaborador_horarios (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  horario_id     uuid not null references public.ponto_horarios (id),
  de             date not null,
  ate            date,
  criado_por     uuid,
  criado_em      timestamptz not null default now()
);
create index if not exists colaborador_horarios_pessoa_idx on public.colaborador_horarios (colaborador_id, de);

-- Exceção de um dia: outro horário só naquela data (horario_id null = folga no dia).
create table if not exists public.ponto_horario_excecoes (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  data           date not null,
  horario_id     uuid references public.ponto_horarios (id),
  obs            text,
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  unique (colaborador_id, data)
);

do $$
declare t text;
begin
  foreach t in array array['ponto_horarios', 'colaborador_horarios', 'ponto_horario_excecoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_empresa', t);
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual())', t || '_empresa', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;

-- Os 5 horários do RHiD da Brasa (prints de 24/10/2026) e todo mundo que bate
-- ponto no "Horário Restaurante" desde a admissão (como no RHiD).
do $$
declare
  emp uuid := '00000000-0000-4000-8000-000000000001';
  rest uuid;
begin
  if not exists (select 1 from public.empresas where id = emp) then return; end if;
  if exists (select 1 from public.ponto_horarios where empresa_id = emp) then return; end if;

  insert into public.ponto_horarios (empresa_id, nome, dias) values
    (emp, 'Horário Restaurante', '{"1":{"p":[["08:00","14:00"]]},"2":{"p":[["08:00","14:00"]]},"3":{"p":[["08:00","14:00"]]},"4":{"p":[["08:00","14:00"]]},"5":{"p":[["08:00","14:00"]]},"6":{"p":[["08:00","14:00"]]}}')
  returning id into rest;
  insert into public.ponto_horarios (empresa_id, nome, dias) values
    (emp, 'Horário Restaurante Garçom', '{"1":{"p":[["09:00","15:00"]]},"2":{"p":[["09:00","15:00"]]},"3":{"p":[["09:00","15:00"]]},"4":{"p":[["09:00","15:00"]]},"5":{"p":[["09:00","15:00"]]},"6":{"p":[["08:00","14:00"]]}}'),
    (emp, 'Horário Restaurante trabalha domingo', '{"0":{"p":[["08:00","14:00"]]},"1":{"p":[["08:00","14:00"]]},"2":{"p":[["08:00","14:00"]]},"3":{"p":[["08:00","14:00"]]},"4":{"p":[["08:00","14:00"]]},"5":{"p":[["08:00","14:00"]]},"6":{"p":[["08:00","14:00"]]}}'),
    (emp, 'Horário início 14h', '{"0":{"p":[["16:30","22:30"]]},"3":{"p":[["14:00","17:00"],["18:00","23:00"]],"almoco_livre":true},"4":{"p":[["14:00","17:00"],["18:00","23:00"]],"almoco_livre":true},"5":{"p":[["14:00","17:00"],["18:00","23:00"]],"almoco_livre":true},"6":{"p":[["14:00","17:00"],["18:00","23:00"]],"almoco_livre":true}}'),
    (emp, 'Horário início 17h', '{"3":{"p":[["17:00","23:00"]]},"4":{"p":[["17:00","23:00"]]},"5":{"p":[["17:00","23:00"]]},"6":{"p":[["17:00","23:00"]]}}');

  -- Quem trabalha seg a sáb vai pro "Horário Restaurante"; quem tem outros dias
  -- no cadastro (Selia: seg a sex) ganha um horário com os dias dela, pra o
  -- cálculo não mudar.
  insert into public.colaborador_horarios (empresa_id, colaborador_id, horario_id, de)
  select emp, c.id, rest, coalesce(c.admissao, date '2025-01-01')
  from public.colaboradores c
  where c.empresa_id = emp and c.bate_ponto and coalesce(c.dias_dia, '{}') @> '{1,2,3,4,5,6}' and coalesce(c.dias_dia, '{}') <@ '{1,2,3,4,5,6}';

  if exists (select 1 from public.colaboradores c where c.empresa_id = emp and c.bate_ponto and coalesce(c.dias_dia, '{}') = '{1,2,3,4,5}') then
    insert into public.ponto_horarios (empresa_id, nome, dias) values
      (emp, 'Horário Restaurante seg a sex', '{"1":{"p":[["08:00","14:00"]]},"2":{"p":[["08:00","14:00"]]},"3":{"p":[["08:00","14:00"]]},"4":{"p":[["08:00","14:00"]]},"5":{"p":[["08:00","14:00"]]}}')
    returning id into rest;
    insert into public.colaborador_horarios (empresa_id, colaborador_id, horario_id, de)
    select emp, c.id, rest, coalesce(c.admissao, date '2025-01-01')
    from public.colaboradores c
    where c.empresa_id = emp and c.bate_ponto and coalesce(c.dias_dia, '{}') = '{1,2,3,4,5}';
  end if;
end $$;
