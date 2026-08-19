-- Conciliação bancária por banco: cada extrato tem seu banco, e a deduplicação
-- passa a ser por (banco, fitid) — bancos diferentes podem repetir o mesmo fitid.
alter table public.transacoes_banco
  add column if not exists banco text;

alter table public.transacoes_banco
  drop constraint if exists transacoes_banco_fitid_key;

create unique index if not exists uq_transacoes_banco_banco_fitid
  on public.transacoes_banco (banco, fitid);
