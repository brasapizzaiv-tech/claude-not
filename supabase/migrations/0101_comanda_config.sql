-- Formato da comanda por impressora (via): largura e o que aparece.
-- Ex.: { "largura": 80, "precos": false, "garcom": true, "hora": true }
alter table public.impressoras
  add column if not exists comanda_config jsonb;
