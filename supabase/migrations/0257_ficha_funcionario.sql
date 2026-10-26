-- FICHA DO FUNCIONÁRIO (Rafael, 26/10/2026: sair do RHiD). Igual às abas do
-- "Editar Funcionário" do RHiD: informações gerais (matrícula, departamento,
-- cargo, número da folha, CTPS, superior direto, observações do cartão de
-- ponto), dados pessoais, histórico de cargos, motivo da demissão e documentos.
-- Dados pessoais ficam SÓ no banco (nunca no código).

-- Cadastros simples (lista com nome), um por empresa.
do $$
declare t text;
begin
  foreach t in array array['departamentos', 'cargos', 'motivos_demissao'] loop
    execute format($f$
      create table if not exists public.%I (
        id         uuid primary key default gen_random_uuid(),
        empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
        nome       text not null,
        ativo      boolean not null default true,
        criado_em  timestamptz not null default now(),
        unique (empresa_id, nome)
      )$f$, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_empresa', t);
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual())', t || '_empresa', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;

alter table public.colaboradores
  -- Informações gerais
  add column if not exists matricula          text,
  add column if not exists departamento_id    uuid references public.departamentos (id) on delete set null,
  add column if not exists cargo_id           uuid references public.cargos (id) on delete set null,
  add column if not exists numero_folha       text,
  add column if not exists ctps               text,
  add column if not exists superior_id        uuid references public.colaboradores (id) on delete set null,
  add column if not exists obs_cartao_ponto   text,
  add column if not exists motivo_demissao_id uuid references public.motivos_demissao (id) on delete set null,
  -- Dados pessoais
  add column if not exists rg                  text,
  add column if not exists nome_social         text,
  add column if not exists cnh                 text,
  add column if not exists cnh_categoria       text,
  add column if not exists cnh_validade        date,
  add column if not exists cep                 text,
  add column if not exists endereco            text,
  add column if not exists endereco_numero     text,
  add column if not exists bairro              text,
  add column if not exists cidade              text,
  add column if not exists uf                  text,
  add column if not exists telefone            text,
  add column if not exists telefone_emergencia text,
  add column if not exists nome_pai            text,
  add column if not exists nome_mae            text,
  add column if not exists genero              text,
  add column if not exists tipo_sanguineo      text;

-- Histórico de cargos (de, até, cargo), como o do RHiD.
create table if not exists public.colaborador_cargos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  cargo_id       uuid not null references public.cargos (id),
  de             date not null,
  ate            date,
  criado_em      timestamptz not null default now()
);
create index if not exists colaborador_cargos_pessoa_idx on public.colaborador_cargos (colaborador_id, de);

-- Documentos da pessoa (contrato, exame, CNH...): arquivo no bucket privado,
-- validade e, se pedir, assinatura no app da equipe.
create table if not exists public.colaborador_documentos (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null default public.empresa_atual() references public.empresas (id),
  colaborador_id      uuid not null references public.colaboradores (id) on delete cascade,
  nome                text not null,
  tipo                text,
  arquivo             text not null,
  validade            date,
  pedir_assinatura    boolean not null default false,
  assinado_em         timestamptz,
  assinatura_ip       text,
  assinatura_aparelho text,
  criado_por          uuid,
  criado_em           timestamptz not null default now()
);
create index if not exists colaborador_documentos_pessoa_idx on public.colaborador_documentos (colaborador_id);

do $$
declare t text;
begin
  foreach t in array array['colaborador_cargos', 'colaborador_documentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_empresa', t);
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual())', t || '_empresa', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public)
values ('documentos-equipe', 'documentos-equipe', false)
on conflict (id) do nothing;
drop policy if exists documentos_equipe_arquivos on storage.objects;
create policy documentos_equipe_arquivos on storage.objects for all to authenticated
  using (bucket_id = 'documentos-equipe' and (storage.foldername(name))[1] = public.empresa_atual()::text)
  with check (bucket_id = 'documentos-equipe' and (storage.foldername(name))[1] = public.empresa_atual()::text);

-- Listas iniciais (as do RHiD da Brasa) e a função que já estava escrita vira cargo.
do $$
declare emp uuid := '00000000-0000-4000-8000-000000000001';
begin
  if not exists (select 1 from public.empresas where id = emp) then return; end if;
  insert into public.departamentos (empresa_id, nome) values (emp, 'Caixa'), (emp, 'Cozinha'), (emp, 'Salão') on conflict do nothing;
  insert into public.cargos (empresa_id, nome) values
    (emp, 'Auxiliar de Cozinha'), (emp, 'Chapista'), (emp, 'Diretor'), (emp, 'Garçom Júnior'), (emp, 'Garçom Pleno'), (emp, 'Garçonete')
  on conflict do nothing;
  insert into public.cargos (empresa_id, nome)
  select distinct emp, trim(c.funcao) from public.colaboradores c
  where c.empresa_id = emp and coalesce(trim(c.funcao), '') <> ''
  on conflict do nothing;
  update public.colaboradores c set cargo_id = g.id
  from public.cargos g
  where c.empresa_id = emp and g.empresa_id = emp and c.cargo_id is null and lower(trim(c.funcao)) = lower(g.nome);
  insert into public.colaborador_cargos (empresa_id, colaborador_id, cargo_id, de)
  select emp, c.id, c.cargo_id, coalesce(c.admissao, c.criado_em::date)
  from public.colaboradores c
  where c.empresa_id = emp and c.cargo_id is not null
    and not exists (select 1 from public.colaborador_cargos x where x.colaborador_id = c.id);
  insert into public.motivos_demissao (empresa_id, nome) values
    (emp, 'Demissão por justa causa'), (emp, 'Funcionário solicitou desligamento'), (emp, 'Redução de custos')
  on conflict do nothing;
end $$;
