-- App do garçom dentro do app pessoal da equipe (/eu/{token}): o colaborador
-- marcado com faz_garcom ganha o atalho "Modo garçom" e entra sem login do
-- sistema (cookie com o token dele). Lançamentos guardam quem lançou.
alter table public.colaboradores add column if not exists faz_garcom boolean not null default false;
alter table public.pdv_comanda_itens add column if not exists criado_colab_id uuid references public.colaboradores(id) on delete set null;
