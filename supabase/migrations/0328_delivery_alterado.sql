-- Pedido do delivery editado depois de lançado (pedido do Rafael, 27/11/2026):
-- itens (trocar sabor da pizza, tirar/pôr item) e endereço. Quando o pedido já
-- foi pra cozinha, sai papel novo com "PEDIDO ALTERADO" — esta coluna diz a
-- hora da última alteração (e o papel avisa que vale o novo).
alter table public.delivery_pedidos add column if not exists alterado_em timestamptz;
