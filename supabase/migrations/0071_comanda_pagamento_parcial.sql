-- Pagamento parcial / conta dividida por item: marca cada item e o buffet como
-- pago, para receber por pessoa e deixar o resto da comanda em aberto.
alter table public.pdv_comanda_itens
  add column if not exists pago boolean not null default false;

alter table public.pdv_comandas
  add column if not exists buffet_pago boolean not null default false;
