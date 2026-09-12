-- Fatura do cartão: cada compra vira um lançamento próprio, na sua categoria.
-- As regras guardam o que já foi classificado, pra próxima fatura vir pronta
-- (ex.: tudo que começa com "POSTO IPIRANGA" → Despesas com veículos).
create table if not exists public.fatura_regras (
  id           uuid primary key default gen_random_uuid(),
  padrao       text not null unique,          -- trecho da descrição, em maiúsculas
  categoria_id uuid references public.dre_categorias (id) on delete cascade,
  usos         integer not null default 1,
  criado_em    timestamptz not null default now(),
  usado_em     timestamptz not null default now()
);
alter table public.fatura_regras enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='fatura_regras' and policyname='fatura_regras_all') then
    create policy fatura_regras_all on public.fatura_regras for all to authenticated using (true) with check (true);
  end if;
end $$;

-- A compra guarda a data em que aconteceu (a fatura vence depois).
alter table public.lancamentos add column if not exists compra_em date;
