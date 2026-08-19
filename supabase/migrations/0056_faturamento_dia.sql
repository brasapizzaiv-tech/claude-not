-- Faturamento diário lançado manualmente (por turno), para calcular o CMV%
-- enquanto o fechamento de caixa não está sendo usado em cheio.
-- Turnos: 'dia' (almoço, seg–sáb) e 'noite' (sex e sáb).
create table if not exists public.faturamento_dia (
  id     uuid primary key default gen_random_uuid(),
  data   date not null,
  turno  text not null default 'dia' check (turno in ('dia', 'noite')),
  valor  numeric not null default 0,
  unique (data, turno)
);

alter table public.faturamento_dia enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'faturamento_dia' and policyname = 'fd_all'
  ) then
    create policy "fd_all" on public.faturamento_dia
      for all to authenticated using (true) with check (true);
  end if;
end $$;
