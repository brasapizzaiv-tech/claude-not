-- Destaque do app pode ser PIZZA (Rafael, 19/10/2026): a pizza não é um
-- produto do cardápio (é montada: tamanho + sabores), então o destaque guarda
-- o tamanho e, se quiser, o sabor. "Pedir agora" abre o montador já nele.
alter table public.vitrine_destaques
  add column if not exists pizza_tamanho_id uuid references public.pdv_pizza_tamanhos(id) on delete set null,
  add column if not exists pizza_sabor_id   uuid references public.pdv_pizza_sabores(id) on delete set null;
