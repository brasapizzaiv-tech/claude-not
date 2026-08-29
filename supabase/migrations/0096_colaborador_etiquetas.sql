-- Permite marcar quais colaboradores podem gerar etiquetas / dar baixa pelo app.
alter table public.colaboradores
  add column if not exists faz_etiquetas boolean not null default false;
