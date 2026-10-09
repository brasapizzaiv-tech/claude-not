-- LEMBRETES PRA EQUIPE
--
-- A gestão escreve um lembrete no painel (/lembretes) e ele aparece no app de
-- cada pessoa (/eu/{token}) no dia certo, com um botão: "Visto" (aviso) ou
-- "Feito" (tarefa). Fica registrado quem confirmou e a que horas, e o painel
-- mostra quem ainda não viu.
--
-- Pra quem: todos, um ou mais setores (os mesmos dos checklists) ou pessoas.
-- Quando: uma vez (data), todo dia, dias da semana ou um dia do mês, com hora
-- opcional e um "até" opcional. A regra de qual dia vale mora em
-- src/lib/lembretes-core.ts, testada em scripts/lembretes.test.mjs.
create table if not exists public.lembretes (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null default public.empresa_atual() references public.empresas (id),
  titulo          text not null,
  texto           text,
  tipo            text not null default 'aviso' check (tipo in ('aviso', 'tarefa')),
  para            text not null default 'todos' check (para in ('todos', 'setores', 'pessoas')),
  setor_ids       uuid[] not null default '{}',
  colaborador_ids uuid[] not null default '{}',
  repeticao       text not null default 'uma_vez'
                  check (repeticao in ('uma_vez', 'diario', 'semanal', 'mensal')),
  data            date not null,              -- uma vez: o dia; repetição: a partir de
  ate             date,                       -- repetição: até quando (vazio = sem fim)
  dias            int[] not null default '{}',-- semanal: 0=dom ... 6=sáb
  dia_mes         int check (dia_mes between 1 and 31), -- mensal
  hora            text check (hora is null or hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ativo           boolean not null default true,
  criado_por      uuid,
  criado_em       timestamptz not null default now()
);
create index if not exists lembretes_empresa_idx on public.lembretes (empresa_id, ativo);

-- Uma confirmação por pessoa por dia do lembrete (repetido = confirma de novo
-- a cada dia; uma vez = confirma uma vez só, no dia em que viu).
create table if not exists public.lembrete_confirmacoes (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  lembrete_id    uuid not null references public.lembretes (id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  dia            date not null,
  confirmado_em  timestamptz not null default now(),
  unique (lembrete_id, colaborador_id, dia)
);
create index if not exists lembrete_conf_lembrete_idx on public.lembrete_confirmacoes (lembrete_id, dia);

alter table public.lembretes enable row level security;
alter table public.lembrete_confirmacoes enable row level security;
do $$
declare t text;
begin
  foreach t in array array['lembretes', 'lembrete_confirmacoes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_empresa', t);
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual())', t || '_empresa', t);
  end loop;
end $$;
grant select, insert, update, delete on public.lembretes, public.lembrete_confirmacoes to authenticated, service_role;
