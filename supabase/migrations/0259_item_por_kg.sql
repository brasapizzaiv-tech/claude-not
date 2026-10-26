-- ITEM VENDIDO POR KG (Rafael, 26/10/2026): "Buffet a KG" no garçom, no PDV e
-- na comanda do caixa pede o PESO ao escolher; a quantidade vira os kg
-- (ex.: 0,452) e o valor = preço do kg × peso. Na nota sai em KG.
alter table public.pdv_itens
  add column if not exists por_kg boolean not null default false;

update public.pdv_itens set por_kg = true where nome ilike 'buffet a kg%';
