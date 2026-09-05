-- Quem trabalha de dia com carteira assinada e de noite como free:
-- vinculo = vínculo do dia (ou do único turno); vinculo_noite = da noite (só p/ "dia e noite").
alter table public.colaboradores
  add column if not exists vinculo_noite text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'colaboradores_vinculo_noite_check') then
    alter table public.colaboradores add constraint colaboradores_vinculo_noite_check
      check (vinculo_noite is null or vinculo_noite in ('clt', 'freelance'));
  end if;
end $$;
