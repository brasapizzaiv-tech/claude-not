-- Etiquetas das marmitas do convênio (Kern) na impressora de etiquetas, pelo
-- agente de impressão (fila tipo 'marmita', ref_id = id do mkt_pedidos).
alter table public.impressoras add column if not exists recebe_marmitas boolean not null default false;

alter table public.impressao_fila drop constraint if exists impressao_fila_tipo_check;
alter table public.impressao_fila add constraint impressao_fila_tipo_check
  check (tipo in ('etiqueta', 'comanda', 'teste', 'teste_etiqueta', 'marmita'));
