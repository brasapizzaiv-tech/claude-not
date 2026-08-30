-- Roteamento por PRODUTO (mais fino que categoria): a via da impressora imprime
-- só os produtos escolhidos. null = imprime todos. Categoria na tela é só um
-- atalho para marcar/desmarcar todos os produtos dela.
alter table public.impressoras
  add column if not exists comanda_produtos uuid[];

-- Converte a seleção antiga por categoria em produtos (não perde configuração).
update public.impressoras im
   set comanda_produtos = sub.ids
  from (
    select i.id, array_agg(p.id) as ids
      from public.impressoras i
      join public.pdv_itens p on p.categoria = any (i.comanda_categorias)
     where i.comanda_categorias is not null
     group by i.id
  ) sub
 where im.id = sub.id
   and im.comanda_produtos is null;
