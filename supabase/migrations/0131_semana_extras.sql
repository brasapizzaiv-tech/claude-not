-- Valor extra por pessoa na semana (algo que fez a mais: hora extra, evento,
-- ajuda…). Entra no total a pagar e no lançamento do contas a pagar.
create table if not exists public.semana_extras (
  id             uuid primary key default gen_random_uuid(),
  segunda        date not null,
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  valor          numeric not null default 0,
  motivo         text,
  criado_em      timestamptz not null default now(),
  unique (segunda, colaborador_id)
);
alter table public.semana_extras enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='semana_extras' and policyname='se_all') then
    create policy "se_all" on public.semana_extras for all to authenticated using (true) with check (true);
  end if;
end $$;
