-- ETAPA 2 DO MULTIEMPRESA — bloco 1: compras, cotacao e estoque
--
-- Cada linha destas tabelas passa a ter dono. Duas coisas por tabela:
--
--   1. a coluna `empresa_id`, que já nasce preenchida com a Brasa (é o que
--      `empresa_atual()` responde hoje), então NENHUM dado muda de lugar;
--   2. a regra de leitura e escrita deixa de ser "quem está logado vê tudo" e
--      passa a ser "quem está logado vê o da empresa dele".
--
-- O `with check` é tão importante quanto o `using`: sem ele dá pra LER só o
-- seu e mesmo assim GRAVAR uma linha carimbada com a empresa de outro.
--
-- Atenção: isto protege quem entra com login. Os apps por link (cotação do
-- fornecedor, contagem da equipe) falam com o banco pela chave administrativa,
-- que passa por cima destas regras — lá o filtro é no código, e vai junto
-- neste mesmo commit.

-- fornecedores (67 linhas)
alter table public.fornecedores
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists fornecedores_empresa_idx on public.fornecedores (empresa_id);
drop policy if exists "acesso_autenticado" on public.fornecedores;
create policy fornecedores_empresa on public.fornecedores for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- produtos (401 linhas)
alter table public.produtos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists produtos_empresa_idx on public.produtos (empresa_id);
drop policy if exists "acesso_autenticado" on public.produtos;
create policy produtos_empresa on public.produtos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- categorias (16 linhas)
alter table public.categorias
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists categorias_empresa_idx on public.categorias (empresa_id);
drop policy if exists "acesso_autenticado" on public.categorias;
create policy categorias_empresa on public.categorias for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- fornecedor_produto (2339 linhas)
alter table public.fornecedor_produto
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists fornecedor_produto_empresa_idx on public.fornecedor_produto (empresa_id);
drop policy if exists "acesso_autenticado" on public.fornecedor_produto;
create policy fornecedor_produto_empresa on public.fornecedor_produto for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- cotacoes (19 linhas)
alter table public.cotacoes
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists cotacoes_empresa_idx on public.cotacoes (empresa_id);
drop policy if exists "acesso_autenticado" on public.cotacoes;
create policy cotacoes_empresa on public.cotacoes for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- cotacao_fornecedores (184 linhas)
alter table public.cotacao_fornecedores
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists cotacao_fornecedores_empresa_idx on public.cotacao_fornecedores (empresa_id);
drop policy if exists "acesso_autenticado" on public.cotacao_fornecedores;
create policy cotacao_fornecedores_empresa on public.cotacao_fornecedores for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- cotacao_itens (601 linhas)
alter table public.cotacao_itens
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists cotacao_itens_empresa_idx on public.cotacao_itens (empresa_id);
drop policy if exists "acesso_autenticado" on public.cotacao_itens;
create policy cotacao_itens_empresa on public.cotacao_itens for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- cotacao_itens_backup (9 linhas)
alter table public.cotacao_itens_backup
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists cotacao_itens_backup_empresa_idx on public.cotacao_itens_backup (empresa_id);
drop policy if exists "cib_all" on public.cotacao_itens_backup;
create policy cotacao_itens_backup_empresa on public.cotacao_itens_backup for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- cotacao_ofertas_extra (21 linhas)
alter table public.cotacao_ofertas_extra
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists cotacao_ofertas_extra_empresa_idx on public.cotacao_ofertas_extra (empresa_id);
drop policy if exists "oe_all" on public.cotacao_ofertas_extra;
create policy cotacao_ofertas_extra_empresa on public.cotacao_ofertas_extra for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- cotacao_precos (3119 linhas)
alter table public.cotacao_precos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists cotacao_precos_empresa_idx on public.cotacao_precos (empresa_id);
drop policy if exists "acesso_autenticado" on public.cotacao_precos;
create policy cotacao_precos_empresa on public.cotacao_precos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pedidos (105 linhas)
alter table public.pedidos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pedidos_empresa_idx on public.pedidos (empresa_id);
drop policy if exists "acesso_autenticado" on public.pedidos;
create policy pedidos_empresa on public.pedidos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pedido_itens (685 linhas)
alter table public.pedido_itens
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pedido_itens_empresa_idx on public.pedido_itens (empresa_id);
drop policy if exists "acesso_autenticado" on public.pedido_itens;
create policy pedido_itens_empresa on public.pedido_itens for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- contagens (18 linhas)
alter table public.contagens
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists contagens_empresa_idx on public.contagens (empresa_id);
drop policy if exists "acesso_autenticado" on public.contagens;
create policy contagens_empresa on public.contagens for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- contagem_itens (2331 linhas)
alter table public.contagem_itens
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists contagem_itens_empresa_idx on public.contagem_itens (empresa_id);
drop policy if exists "acesso_autenticado" on public.contagem_itens;
create policy contagem_itens_empresa on public.contagem_itens for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- contagem_atribuicoes (75 linhas)
alter table public.contagem_atribuicoes
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists contagem_atribuicoes_empresa_idx on public.contagem_atribuicoes (empresa_id);
drop policy if exists "acesso_autenticado" on public.contagem_atribuicoes;
create policy contagem_atribuicoes_empresa on public.contagem_atribuicoes for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- contagem_links (15 linhas)
alter table public.contagem_links
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists contagem_links_empresa_idx on public.contagem_links (empresa_id);
drop policy if exists "acesso_autenticado" on public.contagem_links;
create policy contagem_links_empresa on public.contagem_links for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- contagem_agendamentos (3 linhas)
alter table public.contagem_agendamentos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists contagem_agendamentos_empresa_idx on public.contagem_agendamentos (empresa_id);
drop policy if exists "ag_all" on public.contagem_agendamentos;
create policy contagem_agendamentos_empresa on public.contagem_agendamentos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- cmv_compras_manual (0 linhas)
alter table public.cmv_compras_manual
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists cmv_compras_manual_empresa_idx on public.cmv_compras_manual (empresa_id);
drop policy if exists "ccm_all" on public.cmv_compras_manual;
create policy cmv_compras_manual_empresa on public.cmv_compras_manual for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

