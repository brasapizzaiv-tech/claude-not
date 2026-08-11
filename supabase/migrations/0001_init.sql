-- =============================================================
-- Módulo 1 — Compras & Cotação
-- Esquema inicial: usuários/papéis, fornecedores, produtos,
-- contagem de estoque, cotação, comparação e pedidos.
-- =============================================================

-- ---------- Perfis de usuário (papéis) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text,
  papel      text not null default 'comprador'
             check (papel in ('dono', 'comprador', 'conferente')),
  criado_em  timestamptz not null default now()
);

-- Cria automaticamente um perfil quando um usuário é criado no Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Fornecedores ----------
create table if not exists public.fornecedores (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  cnpj         text,
  contato      text,
  telefone     text,
  email        text,
  whatsapp     text,
  observacoes  text,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

-- ---------- Categorias de produto ----------
create table if not exists public.categorias (
  id    uuid primary key default gen_random_uuid(),
  nome  text not null unique
);

-- ---------- Produtos ----------
create table if not exists public.produtos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  unidade         text not null default 'un',
  categoria_id    uuid references public.categorias (id) on delete set null,
  estoque_minimo  numeric not null default 0,
  observacoes     text,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- ---------- Contagem de estoque ----------
create table if not exists public.contagens (
  id             uuid primary key default gen_random_uuid(),
  descricao      text,
  data           date not null default current_date,
  responsavel_id uuid references auth.users (id) on delete set null,
  status         text not null default 'rascunho'
                 check (status in ('rascunho', 'finalizada')),
  criado_em      timestamptz not null default now()
);

create table if not exists public.contagem_itens (
  id           uuid primary key default gen_random_uuid(),
  contagem_id  uuid not null references public.contagens (id) on delete cascade,
  produto_id   uuid not null references public.produtos (id) on delete cascade,
  qtd_estoque  numeric not null default 0,
  qtd_pedir    numeric not null default 0,
  unique (contagem_id, produto_id)
);

-- ---------- Cotação ----------
create table if not exists public.cotacoes (
  id           uuid primary key default gen_random_uuid(),
  descricao    text,
  contagem_id  uuid references public.contagens (id) on delete set null,
  data         date not null default current_date,
  prazo        date,
  status       text not null default 'aberta'
               check (status in ('aberta', 'fechada')),
  criado_em    timestamptz not null default now()
);

-- Itens (produtos + quantidade) que estão sendo cotados.
create table if not exists public.cotacao_itens (
  id          uuid primary key default gen_random_uuid(),
  cotacao_id  uuid not null references public.cotacoes (id) on delete cascade,
  produto_id  uuid not null references public.produtos (id) on delete cascade,
  qtd         numeric not null default 0,
  unique (cotacao_id, produto_id)
);

-- Fornecedores convidados para a cotação.
create table if not exists public.cotacao_fornecedores (
  id            uuid primary key default gen_random_uuid(),
  cotacao_id    uuid not null references public.cotacoes (id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores (id) on delete cascade,
  status        text not null default 'enviado'
                check (status in ('enviado', 'respondido')),
  unique (cotacao_id, fornecedor_id)
);

-- Preços informados por cada fornecedor para cada produto.
create table if not exists public.cotacao_precos (
  id            uuid primary key default gen_random_uuid(),
  cotacao_id    uuid not null references public.cotacoes (id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores (id) on delete cascade,
  produto_id    uuid not null references public.produtos (id) on delete cascade,
  preco_unit    numeric,
  disponivel    boolean not null default true,
  observacao    text,
  unique (cotacao_id, fornecedor_id, produto_id)
);

-- ---------- Pedidos de compra ----------
create table if not exists public.pedidos (
  id            uuid primary key default gen_random_uuid(),
  cotacao_id    uuid references public.cotacoes (id) on delete set null,
  fornecedor_id uuid references public.fornecedores (id) on delete set null,
  data          date not null default current_date,
  status        text not null default 'rascunho'
                check (status in ('rascunho', 'enviado', 'recebido', 'conferido')),
  observacoes   text,
  criado_em     timestamptz not null default now()
);

create table if not exists public.pedido_itens (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pedidos (id) on delete cascade,
  produto_id  uuid not null references public.produtos (id) on delete cascade,
  qtd         numeric not null default 0,
  preco_unit  numeric,
  unique (pedido_id, produto_id)
);

-- =============================================================
-- Segurança (RLS): por enquanto, qualquer usuário LOGADO pode
-- ler e escrever. Refinamos por papel mais adiante.
-- =============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','fornecedores','categorias','produtos',
    'contagens','contagem_itens','cotacoes','cotacao_itens',
    'cotacao_fornecedores','cotacao_precos','pedidos','pedido_itens'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      drop policy if exists "acesso_autenticado" on public.%I;
      create policy "acesso_autenticado" on public.%I
        for all to authenticated using (true) with check (true);
    $p$, t, t);
  end loop;
end $$;

-- Índices úteis para as telas de listagem e comparação.
create index if not exists idx_produtos_categoria    on public.produtos (categoria_id);
create index if not exists idx_contagem_itens_cont   on public.contagem_itens (contagem_id);
create index if not exists idx_cotacao_itens_cot      on public.cotacao_itens (cotacao_id);
create index if not exists idx_cotacao_precos_cot     on public.cotacao_precos (cotacao_id);
create index if not exists idx_pedido_itens_pedido    on public.pedido_itens (pedido_id);
