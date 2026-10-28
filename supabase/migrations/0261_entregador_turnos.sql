-- TURNOS DO ENTREGADOR (Rafael, 28/10/2026): marca se ele trabalha no almoço,
-- na noite ou nos dois. O fixo do turno (e, no almoço, as teles grátis
-- cobertas pelo fixo) só vale no turno marcado; tele fora do turno dele paga
-- o valor da área. A regra dos fixos passou de 3 pra 10 grátis no almoço.
alter table public.entregadores
  add column if not exists trabalha_dia boolean not null default true,
  add column if not exists trabalha_noite boolean not null default true;

update public.entregadores set gratis_incluidas_dia = 10 where gratis_incluidas_dia = 3;
