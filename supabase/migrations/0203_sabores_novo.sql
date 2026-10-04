-- Sabores de pizza: marcador "novo" como campo, não como emoji no nome
-- (03/10/2026). Os nomes vieram do Suitable com "🆕" colado ("Brasa🆕"), que
-- aparecia em todo lugar — app do cliente, garçom, cupom. Agora o app desenha
-- um selo "Novo" a partir do campo, e o nome fica limpo.
alter table public.pdv_pizza_sabores add column if not exists novo boolean not null default false;
update public.pdv_pizza_sabores set novo = true where nome like '%🆕%' or nome ~* '\s*\bnovo\s*$';
update public.pdv_pizza_sabores set nome = btrim(replace(nome, '🆕', '')) where nome like '%🆕%';
