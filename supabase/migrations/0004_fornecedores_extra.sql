-- Dados comerciais dos fornecedores, aproveitados da importação do vmarket.
alter table public.fornecedores
  add column if not exists pedido_minimo    numeric,
  add column if not exists valor_frete      numeric,
  add column if not exists prazo_pagamento  text,
  add column if not exists prazo_entrega    text;
