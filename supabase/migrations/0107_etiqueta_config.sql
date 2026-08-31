-- Formato da ETIQUETA por impressora (tamanho do papel, margem, letra, QR),
-- igual ao comanda_config. null = padrão 55x55mm.
alter table public.impressoras
  add column if not exists etiqueta_config jsonb;
