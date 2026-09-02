-- Unidade padrão da porção por item (kg, un, g...) — vem preenchida no formulário.
-- E as categorias que faltavam pra receber a lista do sistema antigo (KALI).
alter table public.etiqueta_itens add column if not exists unidade text;

insert into public.etiqueta_categorias (nome, ordem) values
  ('Pratos Finalizados', 19), ('Sobremesa', 20), ('Temperos', 21), ('Salada', 22), ('Queijos', 23)
on conflict (nome) do nothing;
