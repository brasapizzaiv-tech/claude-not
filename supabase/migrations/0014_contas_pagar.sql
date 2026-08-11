-- Contas a pagar: vencimento e status de pagamento dos lançamentos.
alter table public.lancamentos
  add column if not exists vencimento date,
  add column if not exists pago       boolean not null default true,
  add column if not exists pago_em    date;

create index if not exists idx_lancamentos_pago on public.lancamentos (pago, vencimento);
