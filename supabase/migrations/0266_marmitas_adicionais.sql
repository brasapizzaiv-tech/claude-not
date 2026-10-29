-- ADICIONAIS DAS MARMITAS PUXAM O CARDÁPIO DO DIA (Rafael, 28/10/2026).
-- O grupo "Adicionais" da Tradicional (e da Premium, no sábado) passa a ter
-- todos os pratos do dia (proteínas + acompanhamentos), cada um com o preço que
-- já tem na lista de adicionais. Prato sem preço lá não entra (não sai de
-- graça); o editor do cardápio avisa quais são.
alter table public.pdv_item_grupos drop constraint if exists pdv_item_grupos_cardapio_fonte_check;
alter table public.pdv_item_grupos
  add constraint pdv_item_grupos_cardapio_fonte_check check (cardapio_fonte in ('proteinas', 'carboidratos', 'todos'));
