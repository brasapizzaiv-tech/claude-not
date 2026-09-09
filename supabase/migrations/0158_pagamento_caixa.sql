-- Tela de pagamento do caixa (inspirada no Consumer): vários pagamentos numa
-- conta só, cada um com bandeira do cartão e observação; e limite de crédito
-- por cliente no fiado ("Saldo cliente").
alter table public.pdv_caixa_mov
  add column if not exists bandeira   text,
  add column if not exists observacao text;

alter table public.clientes
  add column if not exists limite_credito numeric(12,2);

comment on column public.clientes.limite_credito is
  'Teto do fiado (Saldo cliente). Vazio = sem limite.';
