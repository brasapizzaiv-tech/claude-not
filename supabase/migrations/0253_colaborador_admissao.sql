-- Data de admissão (Rafael, 24/10/2026): o espelho de ponto contava como FALTA
-- os dias antes de a pessoa entrar (Eloisa, admitida em 01/10, aparecia com 9
-- faltas de 21 a 30/09). Antes da admissão o dia é "fora da escala".
alter table public.colaboradores
  add column if not exists admissao date;
