-- Ficha técnica ↔ prato do cardápio (18/11/2026): a 0320 ligava UMA ficha a UM
-- prato (fichas_tecnicas.cardapio_item_id). Mas a mesma receita serve a vários
-- nomes do cardápio ("Filé de suíno à milanesa" = "Suíno à milanesa" e
-- "Schnitzel de porco"). Agora cada PRATO aponta pra sua ficha.

alter table public.cardapio_itens
  add column if not exists ficha_id uuid references public.fichas_tecnicas(id) on delete set null;

create index if not exists cardapio_itens_ficha on public.cardapio_itens (ficha_id) where ficha_id is not null;

update public.cardapio_itens ci
   set ficha_id = f.id
  from public.fichas_tecnicas f
 where f.cardapio_item_id = ci.id
   and ci.ficha_id is null;

-- fichas_tecnicas.cardapio_item_id fica por enquanto (a versão no ar ainda lê);
-- sai numa migration depois que o código novo estiver publicado.
