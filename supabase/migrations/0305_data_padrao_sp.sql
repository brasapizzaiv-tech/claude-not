-- MAR-04 (Onda 7): data padrão no dia de São Paulo, não no de Londres.
-- CURRENT_DATE do banco é UTC: depois das 21:00 já é "amanhã" — a contagem
-- "Bebidas" de sábado 21:30 nascia com a data de domingo (12 casos), e também
-- pedidos, cotação, lançamento e folga. Só muda o PADRÃO das colunas; nenhuma
-- linha existente é alterada.
alter table public.contagens            alter column data       set default ((now() at time zone 'America/Sao_Paulo')::date);
alter table public.cotacoes             alter column data       set default ((now() at time zone 'America/Sao_Paulo')::date);
alter table public.folgas_funcionarios  alter column entrada_em set default ((now() at time zone 'America/Sao_Paulo')::date);
alter table public.lancamentos          alter column data       set default ((now() at time zone 'America/Sao_Paulo')::date);
alter table public.pedidos              alter column data       set default ((now() at time zone 'America/Sao_Paulo')::date);
