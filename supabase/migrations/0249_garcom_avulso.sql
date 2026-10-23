-- Garçom AVULSO (Rafael, 23/10/2026): link da noite pra garçom esporádico usar o
-- app do garçom sem cadastro. O caixa gera o link; quem abre digita só o nome e
-- vira um colaborador "avulso" (esporádico, garçom) que vale até o fim do link.
create table if not exists public.garcom_convites (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null default public.empresa_atual() references public.empresas (id),
  token       text not null unique,
  valido_ate  timestamptz not null,
  ativo       boolean not null default true,
  criado_por  uuid,
  criado_em   timestamptz not null default now()
);
create index if not exists garcom_convites_empresa_idx on public.garcom_convites (empresa_id, ativo);

alter table public.garcom_convites enable row level security;
drop policy if exists garcom_convites_empresa on public.garcom_convites;
create policy garcom_convites_empresa on public.garcom_convites for all to authenticated
  using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual());
grant select, insert, update, delete on public.garcom_convites to authenticated, service_role;

-- Até quando o garçom avulso entra (null = colaborador normal, sem prazo).
alter table public.colaboradores
  add column if not exists garcom_ate timestamptz;
