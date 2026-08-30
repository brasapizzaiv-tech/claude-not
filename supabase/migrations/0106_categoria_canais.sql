-- Canais por CATEGORIA (como o "Ativo em N lugares" do Suitable): a categoria
-- desligada num canal esconde todos os seus produtos naquele canal.
alter table public.pdv_categorias
  add column if not exists canal_app    boolean not null default true,
  add column if not exists canal_garcom boolean not null default true,
  add column if not exists canal_pdv    boolean not null default true;
