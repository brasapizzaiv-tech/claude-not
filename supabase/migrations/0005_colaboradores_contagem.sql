-- Colaboradores (quem faz a contagem) — cadastro simples, sem login.
create table if not exists public.colaboradores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  whatsapp   text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- Atribuição de categoria a um colaborador dentro de uma contagem.
create table if not exists public.contagem_atribuicoes (
  id             uuid primary key default gen_random_uuid(),
  contagem_id    uuid not null references public.contagens (id) on delete cascade,
  categoria_id   uuid not null references public.categorias (id) on delete cascade,
  colaborador_id uuid references public.colaboradores (id) on delete set null,
  unique (contagem_id, categoria_id)
);

-- Link público (token) de um colaborador para preencher a contagem dele.
create table if not exists public.contagem_links (
  id             uuid primary key default gen_random_uuid(),
  contagem_id    uuid not null references public.contagens (id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  token          text not null unique,
  status         text not null default 'pendente'
                 check (status in ('pendente', 'preenchida')),
  criado_em      timestamptz not null default now(),
  unique (contagem_id, colaborador_id)
);

create index if not exists idx_atrib_contagem on public.contagem_atribuicoes (contagem_id);
create index if not exists idx_links_contagem on public.contagem_links (contagem_id);

-- RLS: uso interno exige login. O preenchimento público valida o token no
-- servidor com a chave de serviço (service_role), que ignora o RLS.
do $$
declare t text;
begin
  foreach t in array array['colaboradores','contagem_atribuicoes','contagem_links']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      drop policy if exists "acesso_autenticado" on public.%I;
      create policy "acesso_autenticado" on public.%I
        for all to authenticated using (true) with check (true);
    $p$, t, t);
  end loop;
end $$;
