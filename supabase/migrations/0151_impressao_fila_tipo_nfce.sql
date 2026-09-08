-- A fila de impressão só aceitava os tipos antigos; o cupom da NFC-e ("nfce")
-- era recusado pelo banco e o "Imprimir nota? → Sim" dava erro.
alter table public.impressao_fila drop constraint if exists impressao_fila_tipo_check;
alter table public.impressao_fila add constraint impressao_fila_tipo_check
  check (tipo in ('etiqueta', 'comanda', 'teste', 'teste_etiqueta', 'marmita', 'nfce'));
