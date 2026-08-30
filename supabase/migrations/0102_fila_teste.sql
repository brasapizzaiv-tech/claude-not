-- Permite enfileirar uma "página de teste" (imprime sem depender de pedido).
alter table public.impressao_fila drop constraint if exists impressao_fila_tipo_check;
alter table public.impressao_fila
  add constraint impressao_fila_tipo_check check (tipo in ('etiqueta', 'comanda', 'teste'));
