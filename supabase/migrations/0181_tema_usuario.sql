-- Etapa 2 do design: cada pessoa escolhe se o painel fica claro ou escuro.
--
-- 'sistema' = segue o aparelho (é o que o sistema fazia até agora, então
-- ninguém percebe mudança até escolher). A preferência mora aqui, no perfil,
-- para valer em qualquer aparelho onde a pessoa entrar — o navegador guarda
-- só uma cópia (cookie) para a tela já nascer na cor certa, sem piscar.
alter table public.profiles
  add column if not exists tema text not null default 'sistema';

alter table public.profiles drop constraint if exists profiles_tema_check;
alter table public.profiles
  add constraint profiles_tema_check check (tema in ('claro', 'escuro', 'sistema'));
