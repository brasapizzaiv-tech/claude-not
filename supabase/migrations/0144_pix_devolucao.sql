-- Estorno (devolução) de Pix recebido, pela própria API do banco.
-- e2eid = identificador do Pix recebido (o banco devolve a partir dele).
-- devolucoes = histórico [{id, valor, motivo, por, em, status}].
alter table public.pix_cobrancas
  add column if not exists e2eid text,
  add column if not exists valor_devolvido numeric(12,2) not null default 0,
  add column if not exists devolucoes jsonb not null default '[]'::jsonb;
