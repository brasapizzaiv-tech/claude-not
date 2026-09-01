-- Pix online no app do cliente (API Pix Sicredi): a cobrança fica ligada ao
-- pedido; quando o banco confirma, o pedido vira pago sozinho.
alter table public.delivery_pedidos
  add column if not exists pix_txid       text,
  add column if not exists pix_copia_cola text,
  add column if not exists pix_status     text check (pix_status in ('aguardando','pago','erro')),
  add column if not exists pix_criado_em  timestamptz;

create index if not exists delivery_pedidos_pix_txid on public.delivery_pedidos (pix_txid) where pix_txid is not null;
