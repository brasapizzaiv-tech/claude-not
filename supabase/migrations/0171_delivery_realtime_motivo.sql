-- Delivery Etapa 2: aviso de pedido novo em tempo real + motivo do cancelamento.
alter table public.delivery_pedidos
  add column if not exists cancelado_motivo text;

-- Realtime: o board recebe INSERT/UPDATE na hora (usuário logado; RLS já
-- limita a authenticated).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'delivery_pedidos'
  ) then
    alter publication supabase_realtime add table public.delivery_pedidos;
  end if;
end $$;
