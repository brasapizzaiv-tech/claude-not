-- Cofre no app da equipe: quem tem esta caixinha em Colaboradores abre o Cofre
-- no /eu, com o PIN. Nasce desligada para todo mundo.
alter table public.colaboradores add column if not exists faz_cofre boolean not null default false;
