-- Log de comandas excluídas (auditoria): guarda o motivo informado, já que a
-- comanda em si é apagada.
create table if not exists public.pdv_comandas_excluidas (
  id             uuid primary key default gen_random_uuid(),
  comanda_numero integer,
  mesa           text,
  valor          numeric,
  motivo         text not null,
  excluido_por   uuid,
  excluido_em    timestamptz not null default now()
);

alter table public.pdv_comandas_excluidas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='pdv_comandas_excluidas' and policyname='pce_all') then
    create policy "pce_all" on public.pdv_comandas_excluidas for all to authenticated using (true) with check (true);
  end if;
end $$;
