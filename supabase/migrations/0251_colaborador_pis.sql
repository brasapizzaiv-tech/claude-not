-- PIS no cadastro (Rafael, 23/10/2026): o relógio tem gente cadastrada pelo PIS
-- (Carlos, Luci e Selia, desde fev/2026) e manda o PIS no lugar do CPF nas
-- batidas. O sistema procurava só pelo CPF e as batidas ficavam soltas.
alter table public.colaboradores
  add column if not exists pis text;
create index if not exists colaboradores_pis_idx on public.colaboradores (pis) where pis is not null;
