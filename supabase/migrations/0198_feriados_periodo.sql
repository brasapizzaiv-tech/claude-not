-- FÉRIAS COLETIVAS: UMA DATA QUE DURA VÁRIOS DIAS
--
-- Até aqui cada registro era um dia. Pra dez dias de casa fechada isso daria
-- dez registros, e a TV mostraria "26/12 FECHA · 27/12 FECHA · 28/12 FECHA"
-- — as duas primeiras linhas gastas dizendo a mesma coisa três vezes e nunca
-- dizendo o que interessa: até quando.
--
-- Com `data_fim`, o mesmo registro cobre o período inteiro e a tela diz o que a
-- equipe precisa saber numa linha só: "fechado até sábado, 02/01".
alter table public.feriados
  add column if not exists data_fim date;

-- Fim antes do começo é erro de digitação, e daria um período de dias negativos.
alter table public.feriados
  drop constraint if exists feriados_periodo_valido;
alter table public.feriados
  add constraint feriados_periodo_valido
  check (data_fim is null or data_fim >= data);

-- As telas perguntam "o que ainda não acabou?", e não "o que ainda não
-- começou": um período já em andamento continua valendo.
create index if not exists feriados_fim_idx on public.feriados (coalesce(data_fim, data));
