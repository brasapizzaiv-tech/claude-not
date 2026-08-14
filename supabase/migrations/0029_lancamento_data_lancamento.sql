-- Campos extras dos lançamentos para os filtros do Contas a Pagar:
--  * lancamento_em: data em que a conta foi registrada (separada da
--    competência = "data" e do vencimento/pagamento);
--  * banco: origem do pagamento (Sicredi, Banrisul, Sicoob, Cofre, Caixa...).
-- O tipo de pagamento continua no campo "forma_pagamento".
alter table public.lancamentos
  add column if not exists lancamento_em date,
  add column if not exists banco text;

create index if not exists idx_lancamentos_competencia on public.lancamentos (data);
create index if not exists idx_lancamentos_venc on public.lancamentos (vencimento);
create index if not exists idx_lancamentos_banco on public.lancamentos (banco);
