-- Observação do pagamento (ex.: "descontado em folha", "pago em dinheiro").
alter table public.retiradas
  add column if not exists obs_pagamento text;
