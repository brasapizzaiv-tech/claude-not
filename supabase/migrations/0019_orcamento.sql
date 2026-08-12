-- Orçamento por categoria e mês (meta). Comparado com o realizado (lançamentos).
create table if not exists public.orcamentos (
  id           uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.dre_categorias (id) on delete cascade,
  ano_mes      text not null,            -- 'AAAA-MM'
  valor        numeric not null default 0,
  unique (categoria_id, ano_mes)
);

alter table public.orcamentos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='orcamentos' and policyname='orc_all') then
    create policy "orc_all" on public.orcamentos for all to authenticated using (true) with check (true);
  end if;
end $$;
