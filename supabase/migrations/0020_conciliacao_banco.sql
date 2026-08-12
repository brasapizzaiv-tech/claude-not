-- Conciliação bancária: transações do extrato (OFX) casadas com lançamentos.
create table if not exists public.transacoes_banco (
  id           uuid primary key default gen_random_uuid(),
  data         date not null,
  valor        numeric not null,          -- negativo = saída, positivo = entrada
  descricao    text,
  fitid        text unique,               -- id único da transação no OFX (evita duplicar)
  lancamento_id uuid references public.lancamentos (id) on delete set null,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_transacoes_banco_data on public.transacoes_banco (data);

alter table public.transacoes_banco enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='transacoes_banco' and policyname='tb_all') then
    create policy "tb_all" on public.transacoes_banco for all to authenticated using (true) with check (true);
  end if;
end $$;
