-- CMV Real: marcador por produto indicando se ele entra no CMV (consumo direto
-- de produção/embalagem) ou é "universal" (limpeza, embalagens gerais, consumo
-- interno...) que fica de fora do cálculo do CMV.
alter table public.produtos
  add column if not exists entra_cmv boolean not null default true;
