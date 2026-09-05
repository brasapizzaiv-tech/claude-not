-- Pagamento da semana (diárias + 10%) lançado no Contas a pagar como
-- "CMO Eventual / Diaristas". Uma linha por pessoa × semana pra não pagar 2x.
create table if not exists public.semana_pagamentos (
  id             uuid primary key default gen_random_uuid(),
  segunda        date not null,                       -- segunda-feira da semana paga
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  valor          numeric not null,
  lancamento_id  uuid references public.lancamentos (id) on delete set null,
  criado_em      timestamptz not null default now(),
  unique (segunda, colaborador_id)
);
alter table public.semana_pagamentos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='semana_pagamentos' and policyname='sp_all') then
    create policy "sp_all" on public.semana_pagamentos for all to authenticated using (true) with check (true);
  end if;
end $$;
