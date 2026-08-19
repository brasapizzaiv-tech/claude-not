-- Fechamento de caixa: registro diário do faturamento real, com as linhas do
-- caixa (venda bruta → saldo final) e a divisão por forma de pagamento.
create table if not exists public.fechamentos_caixa (
  id           uuid primary key default gen_random_uuid(),
  data         date not null,
  venda_bruta  numeric not null default 0,
  acrescimos   numeric not null default 0,
  cancelados   numeric not null default 0,
  descontos    numeric not null default 0,
  fretes       numeric not null default 0,
  fundo_caixa  numeric not null default 0,
  recebimentos numeric not null default 0,
  creditos     numeric not null default 0,
  pagamentos   numeric not null default 0,
  fiado        numeric not null default 0,
  quebra       numeric not null default 0,
  formas       jsonb not null default '[]',   -- [{forma, pedidos, valor}]
  observacao   text,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_fechamentos_caixa_data
  on public.fechamentos_caixa (data desc);

alter table public.fechamentos_caixa enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'fechamentos_caixa' and policyname = 'fc_all'
  ) then
    create policy "fc_all" on public.fechamentos_caixa
      for all to authenticated using (true) with check (true);
  end if;
end $$;
