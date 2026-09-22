-- MURAL NUMA TELA SEM LOGIN
--
-- O mural do escritório nasceu como tela do painel, com login. Numa TV isso não
-- serve: a sessão cai, ninguém está lá pra digitar senha, e a tela fica na
-- página de login o dia inteiro. Mesma solução da TV da cozinha: um link com
-- uma chave dentro.
--
-- A chave mora no banco, e não numa variável do servidor, por dois motivos:
-- o Rafael troca o link sozinho pela tela, sem passar na Vercel; e cada empresa
-- tem a sua — uma chave global abriria o mural de todas.
create table if not exists public.mural_config (
  empresa_id uuid primary key default public.empresa_atual() references public.empresas (id),
  chave      text not null unique,
  criado_em  timestamptz not null default now()
);

alter table public.mural_config enable row level security;
drop policy if exists mural_config_empresa on public.mural_config;
create policy mural_config_empresa on public.mural_config for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- Já nasce com uma chave sorteada por empresa, pra o link existir antes de
-- alguém abrir a tela. uuid sem os traços: 32 caracteres, sem depender do
-- pgcrypto estar instalado.
insert into public.mural_config (empresa_id, chave)
select e.id, replace(gen_random_uuid()::text, '-', '')
  from public.empresas e
 where not exists (select 1 from public.mural_config m where m.empresa_id = e.id);
