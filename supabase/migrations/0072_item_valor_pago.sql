-- Dividir um item entre pessoas: controla QUANTO já foi pago de cada item e do
-- buffet (não só pago/não pago), para rachar uma linha e deixar o resto aberto.
alter table public.pdv_comanda_itens
  add column if not exists valor_pago numeric not null default 0;

alter table public.pdv_comandas
  add column if not exists buffet_valor_pago numeric not null default 0;
