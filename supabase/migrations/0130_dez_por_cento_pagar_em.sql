-- O 10% de uma noite é dividido por quem trabalhou NAQUELA noite, mas entra
-- no acerto da semana seguinte. pagar_em = segunda-feira da semana em que
-- o valor é pago (padrão: semana seguinte à da noite).
alter table public.dez_por_cento_noites
  add column if not exists pagar_em date;

update public.dez_por_cento_noites
   set pagar_em = (date_trunc('week', data)::date + 7)
 where pagar_em is null;

alter table public.dez_por_cento_noites alter column pagar_em set not null;
create index if not exists idx_dez_pagar_em on public.dez_por_cento_noites (pagar_em);
