-- Fichas técnicas (pedido do Rafael, 18/11/2026), vindas da planilha
-- "FICHA TÉCNICA v04" (set/2025, 156 receitas). Cada ficha diz o que vai no
-- prato e quanto rende; cada ingrediente aponta pra um PRODUTO do estoque (o
-- preço vem do preco_referencia, que já se atualiza a cada nota lançada) ou pra
-- OUTRA ficha (molho branco, massa de panqueca...). Assim o custo por kg do
-- prato fica sempre com o preço de hoje — a planilha ficou parada em 2025.
-- Acesso: permissão própria "fichas" (Usuários e permissões); a chefe no
-- celular não vê custo.

create table if not exists public.fichas_tecnicas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas(id),
  nome text not null check (char_length(nome) between 2 and 120),
  categoria text,                         -- aba da planilha: Massas, Molhos, C. Frango...
  rendimento_kg numeric check (rendimento_kg is null or rendimento_kg > 0),  -- quanto sai pronto
  rendimento_texto text,                  -- "1 forma", "porção"
  base boolean not null default false,    -- usada dentro de outras fichas (molho, massa)
  cardapio_item_id uuid references public.cardapio_itens(id) on delete set null,
  custo_kg_planilha numeric,              -- R$/kg na planilha de 2025 (pra comparar)
  obs text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, nome)
);

create index if not exists fichas_tecnicas_empresa on public.fichas_tecnicas (empresa_id, ativo, categoria);
create index if not exists fichas_tecnicas_cardapio on public.fichas_tecnicas (cardapio_item_id) where cardapio_item_id is not null;

create table if not exists public.ficha_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas(id),
  ficha_id uuid not null references public.fichas_tecnicas(id) on delete cascade,
  ordem integer not null default 0,
  descricao text not null,                -- como está na receita ("Nata", "Molho branco")
  produto_id uuid references public.produtos(id) on delete set null,
  sub_ficha_id uuid references public.fichas_tecnicas(id) on delete set null,
  quantidade numeric not null default 0 check (quantidade >= 0),
  unidade text not null default 'kg',     -- kg, g, L, ml, un
  -- Quantas "unidade" (da receita) cabem em 1 unidade do produto. Ex.: receita
  -- em kg e produto "Arroz Branco 5kg" (un) → 5. Vazio = mesma unidade (1).
  conversao numeric check (conversao is null or conversao > 0),
  preco_planilha numeric,                 -- valor desse ingrediente na planilha 2025
  criado_em timestamptz not null default now(),
  check (not (produto_id is not null and sub_ficha_id is not null)),
  check (sub_ficha_id is null or sub_ficha_id <> ficha_id)
);

create index if not exists ficha_itens_ficha on public.ficha_itens (ficha_id, ordem);
create index if not exists ficha_itens_produto on public.ficha_itens (produto_id) where produto_id is not null;

alter table public.fichas_tecnicas enable row level security;
alter table public.ficha_itens enable row level security;

drop policy if exists fichas_tecnicas_empresa on public.fichas_tecnicas;
create policy fichas_tecnicas_empresa on public.fichas_tecnicas
  for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

drop policy if exists ficha_itens_empresa on public.ficha_itens;
create policy ficha_itens_empresa on public.ficha_itens
  for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());
