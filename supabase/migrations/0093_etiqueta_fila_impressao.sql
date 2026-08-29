-- Fila de impressão de etiquetas: a "Estação de impressão" (aba aberta no PC da
-- impressora) pega as pendentes e imprime sozinha.
alter table public.etiquetas
  add column if not exists impressao_solicitada_em timestamptz,
  add column if not exists impresso_em timestamptz;

-- pendentes = solicitadas e ainda não impressas
create index if not exists idx_etiquetas_fila
  on public.etiquetas (impressao_solicitada_em)
  where impressao_solicitada_em is not null and impresso_em is null;
