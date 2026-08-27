-- Histórico das quantidades da cotação: a cada salvamento, guarda um snapshot do
-- estado ANTERIOR, para permitir "Desfazer último salvamento".
create table if not exists public.cotacao_itens_backup (
  id         uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references public.cotacoes (id) on delete cascade,
  itens      jsonb not null,
  criado_em  timestamptz not null default now()
);

create index if not exists cotacao_itens_backup_cot_idx
  on public.cotacao_itens_backup (cotacao_id, criado_em desc);

alter table public.cotacao_itens_backup enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='cotacao_itens_backup' and policyname='cib_all') then
    create policy "cib_all" on public.cotacao_itens_backup for all to authenticated using (true) with check (true);
  end if;
end $$;
