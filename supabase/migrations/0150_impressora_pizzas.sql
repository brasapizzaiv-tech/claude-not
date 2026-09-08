-- Pizza montada (meio a meio, borda) não é um item do cardápio (item_id nulo),
-- então nunca entrava numa impressora com via por produto. Agora a impressora
-- marcada "recebe pizzas" imprime todas as pizzas montadas.
alter table public.impressoras add column if not exists recebe_pizzas boolean not null default false;
