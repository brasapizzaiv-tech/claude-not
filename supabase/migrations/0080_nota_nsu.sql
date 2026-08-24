-- Guarda o NSU (número sequencial da SEFAZ) de cada nota, para permitir
-- reprocessar só um período (ex.: últimos 15 dias) em vez de tudo desde o zero.
alter table public.notas_fiscais
  add column if not exists nsu text;

create index if not exists notas_fiscais_nsu_idx on public.notas_fiscais (nsu);
