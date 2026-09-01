-- Agente da balança (programa no PC da balança): status/heartbeat + contagem
-- da fila offline, pro sistema ALERTAR quando houver pesagens não sincronizadas
-- (lição do Suit Scale: nunca falhar em silêncio).
create table if not exists public.balanca_status (
  id            int primary key default 1 check (id = 1),
  hostname      text,
  visto_em      timestamptz,
  fila_pendente int not null default 0,
  versao        text
);
insert into public.balanca_status (id) values (1) on conflict (id) do nothing;

alter table public.balanca_status enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'balanca_status' and policyname = 'bs_read'
  ) then
    create policy "bs_read" on public.balanca_status
      for select to authenticated using (true);
  end if;
end $$;
