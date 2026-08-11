-- Campos extras de produto, aproveitados da importação do sistema atual.
alter table public.produtos
  add column if not exists marca             text,
  add column if not exists aceita_similar    boolean not null default true,
  add column if not exists preco_referencia  numeric,
  add column if not exists codigo            text;
