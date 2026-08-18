-- Busca esperta: completar notas manifestadas assim que o XML libera.
-- manifestado_em: quando a nota foi manifestada (só quando a SEFAZ liberou o
-- XML, cStat 135). A busca em segundo plano usa isso para saber quais notas
-- ainda estão "aguardando" o XML completo.
alter table public.notas_fiscais
  add column if not exists manifestado_em timestamptz;

-- forcado_em: quando foi a última busca FORÇADA (fora do intervalo de 1h).
-- Serve para espaçar as buscas forçadas e nunca abusar da SEFAZ.
alter table public.config_sefaz
  add column if not exists forcado_em timestamptz;
