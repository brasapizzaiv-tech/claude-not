-- Conferência do recebimento: o que realmente chegou (quantidade e preço).
alter table public.pedido_itens
  add column if not exists qtd_recebida   numeric,
  add column if not exists preco_recebido numeric,
  add column if not exists obs            text;

alter table public.pedidos
  add column if not exists conferido_em timestamptz;
