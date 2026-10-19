-- O que foi escolhido na tela Comparar de uma cotação (fornecedor por item,
-- oferta/marca, quantidade, divisão entre fornecedores, "conferido"). Antes
-- ficava só no navegador do PC onde a pessoa estava: começar no escritório e
-- terminar em casa abria tudo do zero (Rafael, 19/10/2026). Uma linha por
-- cotação; a tela salva sozinha enquanto a pessoa mexe.
create table if not exists public.cotacao_comparacao (
  cotacao_id     uuid primary key references public.cotacoes (id) on delete cascade,
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  estado         jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

alter table public.cotacao_comparacao enable row level security;
drop policy if exists cotacao_comparacao_empresa on public.cotacao_comparacao;
create policy cotacao_comparacao_empresa on public.cotacao_comparacao
  for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

grant select, insert, update, delete on public.cotacao_comparacao to authenticated, service_role;
