-- COMBOS EM ETAPAS, como no Suitable (Rafael, 28/10/2026). Um combo é um
-- item do cardápio (pdv_itens.combo) cujas etapas são os grupos de escolha que
-- já existiam pras marmitas (pdv_item_grupos / pdv_item_opcoes). Cada opção tem
-- o seu "valor no combo" (mais barato que pedir separado); o preço do combo é
-- a soma das etapas. Etapa de pizza (media = true) cobra a MÉDIA dos sabores
-- escolhidos, como a pizza normal; sem borda. A opção pode apontar pro sabor
-- (sabor_id) ou pro produto (produto_id) de onde veio.
alter table public.pdv_itens
  add column if not exists combo boolean not null default false;

alter table public.pdv_item_grupos
  add column if not exists media boolean not null default false,
  add column if not exists tamanho_id uuid references public.pdv_pizza_tamanhos (id) on delete set null;

alter table public.pdv_item_opcoes
  add column if not exists sabor_id uuid references public.pdv_pizza_sabores (id) on delete set null,
  add column if not exists produto_id uuid references public.pdv_itens (id) on delete set null;
