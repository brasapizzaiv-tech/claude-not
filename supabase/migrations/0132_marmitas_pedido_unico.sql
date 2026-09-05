-- Um pedido por colaborador por dia (evita duplicar com dois toques rápidos).
create unique index if not exists idx_mkt_pedidos_colab_dia
  on public.mkt_pedidos (data, colaborador_id)
  where colaborador_id is not null and colaborador_id <> '';
