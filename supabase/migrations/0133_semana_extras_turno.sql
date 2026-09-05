-- Extra da semana pertence a um turno (pra somar no gasto do dia ou da noite).
alter table public.semana_extras
  add column if not exists turno text not null default 'noite' check (turno in ('dia', 'noite'));
