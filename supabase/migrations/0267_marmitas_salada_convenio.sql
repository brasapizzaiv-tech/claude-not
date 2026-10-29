-- SALADA DAS MARMITAS = A DO CONVÊNIO (Rafael, 28/10/2026). O "Deseja
-- salada?" das marmitas do delivery (e dos combos de marmita) continua sim ou
-- não, mas a opção passa a ser a salada do dia das marmitas do convênio (Kern:
-- rotação de 4 semanas ou a troca do dia), em vez do "Alface e tomate" fixo.
alter table public.pdv_item_grupos drop constraint if exists pdv_item_grupos_cardapio_fonte_check;
alter table public.pdv_item_grupos
  add constraint pdv_item_grupos_cardapio_fonte_check check (cardapio_fonte in ('proteinas', 'carboidratos', 'todos', 'salada'));
