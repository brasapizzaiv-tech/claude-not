-- Cardápio do dia no app da equipe (/eu/{token}/cardapio), com permissão por
-- colaborador, histórico de publicações e exceção por data nas marmitas Kern.
--
-- Também nasce aqui o PRIMEIRO passo do multiempresa (Etapa 1 do
-- levantamento): a tabela `empresas` com a Brasa e a função `empresa_atual()`.
-- Toda tabela nova passa a ter `empresa_id` com policy por empresa. Por
-- enquanto a função devolve sempre a Brasa; quando o usuário/colaborador
-- ganhar empresa, só a função muda.

-- ---------- Empresas (Etapa 1 do multiempresa) ----------
create table if not exists public.empresas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  slug       text not null unique,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
insert into public.empresas (id, nome, slug)
values ('00000000-0000-4000-8000-000000000001', 'Brasa Pizzaria e Restaurante', 'brasa')
on conflict (id) do nothing;

-- Empresa do contexto atual. Hoje: sempre a Brasa (só existe ela). Quando o
-- profile/colaborador tiver empresa_id, esta função passa a ler de lá — e
-- nenhuma policy precisa mudar.
create or replace function public.empresa_atual()
returns uuid
language sql
stable
as $$
  select '00000000-0000-4000-8000-000000000001'::uuid
$$;
grant execute on function public.empresa_atual() to anon, authenticated, service_role;

alter table public.empresas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='empresas' and policyname='empresas_propria') then
    create policy empresas_propria on public.empresas
      for select to authenticated using (id = public.empresa_atual());
  end if;
end $$;

-- ---------- Permissão no colaborador ----------
alter table public.colaboradores add column if not exists faz_cardapio boolean not null default false;

-- ---------- cardapio_dia: quem publicou / quem alterou ----------
alter table public.cardapio_dia add column if not exists publicado_em  timestamptz;
alter table public.cardapio_dia add column if not exists publicado_por text;
alter table public.cardapio_dia add column if not exists alterado_em   timestamptz;
alter table public.cardapio_dia add column if not exists alterado_por  text;
-- O que já estava no ar conta como publicado na última atualização.
update public.cardapio_dia set publicado_em = atualizado_em where publicado and publicado_em is null;
update public.cardapio_dia set alterado_em = atualizado_em where alterado_em is null;

-- ---------- Histórico de publicações ----------
create table if not exists public.cardapio_publicacoes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null default public.empresa_atual() references public.empresas (id),
  data          date not null,
  acao          text not null check (acao in ('salvo','publicado','despublicado','apagado','saladas','marmita')),
  detalhe       text,
  por_nome      text,
  por_user_id   uuid,
  por_colab_id  uuid references public.colaboradores (id) on delete set null,
  em            timestamptz not null default now()
);
create index if not exists cardapio_publicacoes_data_idx on public.cardapio_publicacoes (empresa_id, data, em desc);
alter table public.cardapio_publicacoes enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='cardapio_publicacoes' and policyname='cardapio_publicacoes_empresa') then
    create policy cardapio_publicacoes_empresa on public.cardapio_publicacoes
      for all to authenticated
      using (empresa_id = public.empresa_atual())
      with check (empresa_id = public.empresa_atual());
  end if;
end $$;

-- ---------- Marmitas Kern: exceção por data ----------
-- A rotação de 4 semanas continua no app do convênio (mkt_config.cardapios).
-- Aqui fica só o dia que a cozinha quis diferente. Só pode ser gravada ANTES
-- de abrir a janela de pedidos daquele dia (regra no servidor), senão os
-- pedidos já feitos ficariam com itens fora do cardápio.
create table if not exists public.marmitas_dia_excecao (
  empresa_id    uuid not null default public.empresa_atual() references public.empresas (id),
  data          date not null,
  pratos        jsonb not null default '[]'::jsonb,
  proteinas     jsonb not null default '[]'::jsonb,
  salada        text not null default '',
  por_nome      text,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, data)
);
alter table public.marmitas_dia_excecao enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='marmitas_dia_excecao' and policyname='marmitas_dia_excecao_empresa') then
    create policy marmitas_dia_excecao_empresa on public.marmitas_dia_excecao
      for all to authenticated
      using (empresa_id = public.empresa_atual())
      with check (empresa_id = public.empresa_atual());
  end if;
end $$;
