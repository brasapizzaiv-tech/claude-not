-- NF-e / NFC-e — Fase 1: campos fiscais no produto, config fiscal da empresa e
-- cadastro de clientes (destinatário da NF-e). A emissão (chamada ao emissor)
-- vem na Fase 2.

-- Campos fiscais por produto (Simples Nacional usa CSOSN).
alter table public.produtos
  add column if not exists ncm     text,
  add column if not exists cest    text,
  add column if not exists cfop    text,
  add column if not exists csosn   text,
  add column if not exists origem  text default '0';

-- Config fiscal (chave/valor): dados da empresa + emissor (token, ambiente...).
create table if not exists public.config_fiscal (
  chave text primary key,
  valor text
);
alter table public.config_fiscal enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='config_fiscal' and policyname='cf_all') then
    create policy "cf_all" on public.config_fiscal for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Clientes (destinatário da NF-e).
create table if not exists public.clientes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  cpf_cnpj      text,
  ie            text,
  email         text,
  telefone      text,
  cep           text,
  logradouro    text,
  numero        text,
  complemento   text,
  bairro        text,
  municipio     text,
  uf            text,
  cod_municipio text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);
create index if not exists clientes_nome_idx on public.clientes (nome);
alter table public.clientes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='clientes' and policyname='cli_all') then
    create policy "cli_all" on public.clientes for all to authenticated using (true) with check (true);
  end if;
end $$;
