-- Trava a cotação depois que os pedidos são gerados, para nunca apagar
-- pedidos (e conferências) antigos ao clicar "Gerar pedidos" de novo.
alter table public.cotacoes
  add column if not exists pedidos_gerados_em timestamptz;

-- Cotações que JÁ têm pedidos ficam travadas (protege o que já existe).
update public.cotacoes c
   set pedidos_gerados_em = coalesce(c.pedidos_gerados_em, now())
 where exists (select 1 from public.pedidos p where p.cotacao_id = c.id);
