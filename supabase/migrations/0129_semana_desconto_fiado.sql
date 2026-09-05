-- Desconto do fiado (retiradas) no acerto da semana. O lançamento no contas a
-- pagar continua com o valor CHEIO (mão de obra do mês); aqui fica só quanto
-- foi abatido e quanto saiu em mãos.
alter table public.semana_pagamentos
  add column if not exists desconto numeric not null default 0;
