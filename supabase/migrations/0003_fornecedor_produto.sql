-- Vínculo N:N entre fornecedores e produtos (quem fornece o quê).
-- Base para saber a quais fornecedores enviar cada item da cotação.

-- Evita fornecedores duplicados por nome (permite upsert na importação).
create unique index if not exists uq_fornecedores_nome
  on public.fornecedores (nome);

create table if not exists public.fornecedor_produto (
  id            uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores (id) on delete cascade,
  produto_id    uuid not null references public.produtos (id) on delete cascade,
  criado_em     timestamptz not null default now(),
  unique (fornecedor_id, produto_id)
);

create index if not exists idx_fp_produto     on public.fornecedor_produto (produto_id);
create index if not exists idx_fp_fornecedor  on public.fornecedor_produto (fornecedor_id);

alter table public.fornecedor_produto enable row level security;
drop policy if exists "acesso_autenticado" on public.fornecedor_produto;
create policy "acesso_autenticado" on public.fornecedor_produto
  for all to authenticated using (true) with check (true);
