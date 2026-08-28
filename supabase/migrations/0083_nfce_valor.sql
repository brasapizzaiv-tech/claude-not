-- Guarda o valor total da nota emitida, para os totais do painel de notas.
alter table public.nfce_emitidas
  add column if not exists valor numeric;
