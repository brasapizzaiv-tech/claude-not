-- Tipos de etiqueta (manipulação, fracionamento, descongelamento, amostra, livre)
-- e campos opcionais (marca/fornecedor, lote, validade original do fabricante,
-- SIF/registro, texto livre).
alter table public.etiquetas
  add column if not exists tipo              text not null default 'manipulacao',
  add column if not exists marca             text,
  add column if not exists lote              text,
  add column if not exists validade_original date,
  add column if not exists sif               text,
  add column if not exists texto             text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'etiquetas_tipo_check') then
    alter table public.etiquetas add constraint etiquetas_tipo_check
      check (tipo in ('manipulacao', 'fracionamento', 'descongelamento', 'amostra', 'livre'));
  end if;
end $$;
