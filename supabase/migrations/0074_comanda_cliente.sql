-- Vincula um cliente à comanda (destinatário de uma futura NF-e/NFC-e).
-- Preenchido no caixa ao "Vincular Cliente" na hora do pagamento.
alter table public.pdv_comandas
  add column if not exists cliente_id uuid references public.clientes (id);

create index if not exists pdv_comandas_cliente_idx on public.pdv_comandas (cliente_id);
