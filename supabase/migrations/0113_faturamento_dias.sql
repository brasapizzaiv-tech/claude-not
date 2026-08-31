-- Faturamento importado da planilha vive numa tabela PRÓPRIA, usada só na
-- comparação "Notas emitidas × Faturamento". NÃO entra no DRE/lançamentos
-- (lá as receitas já vêm do fechamento do caixa — entrar de novo duplicaria).
create table if not exists public.faturamento_dias (
  data          date primary key,
  almoco        numeric,
  noite         numeric,
  atualizado_em timestamptz not null default now()
);

alter table public.faturamento_dias enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'faturamento_dias' and policyname = 'fd_all'
  ) then
    create policy "fd_all" on public.faturamento_dias
      for all to authenticated using (true) with check (true);
  end if;
end $$;
