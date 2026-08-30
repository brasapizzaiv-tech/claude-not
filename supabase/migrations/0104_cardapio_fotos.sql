-- Cardápio rico pro app do cliente (/pedir): fotos e descrições nos produtos e
-- sabores de pizza, fatias por tamanho, aviso configurável do delivery e o
-- bucket público de fotos do cardápio.

alter table public.pdv_itens
  add column if not exists foto_url  text,
  add column if not exists descricao text;

alter table public.pdv_pizza_sabores
  add column if not exists foto_url  text,
  add column if not exists descricao text;

alter table public.pdv_pizza_tamanhos
  add column if not exists fatias int;

alter table public.delivery_config
  add column if not exists aviso text;

-- Bucket público das fotos do cardápio (upload só pelo servidor/admin).
insert into storage.buckets (id, name, public)
values ('cardapio', 'cardapio', true)
on conflict (id) do nothing;
