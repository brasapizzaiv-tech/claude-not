-- Job de "etiqueta de teste" (moldura na borda pra calibrar o deslocamento da impressora).
alter table public.impressao_fila drop constraint if exists impressao_fila_tipo_check;
alter table public.impressao_fila add constraint impressao_fila_tipo_check
  check (tipo in ('etiqueta', 'comanda', 'teste', 'teste_etiqueta'));
