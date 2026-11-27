-- Ordem dos produtos dentro da categoria (pedido do Rafael, 27/11/2026).
-- Antes tudo saía em ordem alfabética; agora Salão → Cardápio tem setinhas
-- ↑↓ por produto e a ordem vale no garçom, PDV, app do cliente e delivery.
-- Começa na ordem alfabética de hoje (nada muda de lugar até alguém mexer);
-- produto novo nasce sem ordem e vai pro fim da categoria.
alter table public.pdv_itens add column if not exists ordem integer;

update public.pdv_itens i
   set ordem = o.n
  from (
    select id, row_number() over (partition by empresa_id, categoria order by nome, id) as n
      from public.pdv_itens
  ) o
 where o.id = i.id and i.ordem is null;
