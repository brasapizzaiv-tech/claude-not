-- MARMITAS PUXAM O CARDÁPIO DO DIA (Rafael, 28/10/2026). As opções de carne
-- e de pratos quentes das marmitas do delivery deixam de ser fixas: saem do
-- cardápio do dia publicado. A Tradicional leva TUDO do dia; a Marmita do Dia
-- leva só o que quem monta o cardápio marcar (cardapio_dia.marmita_dia).
-- O grupo de escolha diz de onde puxa (cardapio_fonte) e se é só o marcado.
alter table public.cardapio_dia
  add column if not exists marmita_dia jsonb;  -- {"proteinas": [...], "carboidratos": [...]}

alter table public.pdv_item_grupos
  add column if not exists cardapio_fonte text check (cardapio_fonte in ('proteinas', 'carboidratos')),
  add column if not exists cardapio_so_marmita boolean not null default false;
