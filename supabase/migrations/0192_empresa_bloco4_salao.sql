-- ETAPA 2 DO MULTIEMPRESA — bloco 4: salao e PDV
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

-- pdv_caixa_mov (855 linhas)
alter table public.pdv_caixa_mov
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_caixa_mov_empresa_idx on public.pdv_caixa_mov (empresa_id);
drop policy if exists "pdv_caixa_all" on public.pdv_caixa_mov;
create policy pdv_caixa_mov_empresa on public.pdv_caixa_mov for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_caixas (16 linhas)
alter table public.pdv_caixas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_caixas_empresa_idx on public.pdv_caixas (empresa_id);
drop policy if exists "pdv_caixa_all" on public.pdv_caixas;
create policy pdv_caixas_empresa on public.pdv_caixas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_categorias (10 linhas)
alter table public.pdv_categorias
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_categorias_empresa_idx on public.pdv_categorias (empresa_id);
drop policy if exists "pdv_categorias_all" on public.pdv_categorias;
create policy pdv_categorias_empresa on public.pdv_categorias for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_comanda_itens (690 linhas)
alter table public.pdv_comanda_itens
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_comanda_itens_empresa_idx on public.pdv_comanda_itens (empresa_id);
drop policy if exists "pdv_comanda_itens_all" on public.pdv_comanda_itens;
create policy pdv_comanda_itens_empresa on public.pdv_comanda_itens for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_comandas (1429 linhas)
alter table public.pdv_comandas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_comandas_empresa_idx on public.pdv_comandas (empresa_id);
drop policy if exists "pdv_comandas_all" on public.pdv_comandas;
create policy pdv_comandas_empresa on public.pdv_comandas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_comandas_excluidas (117 linhas)
alter table public.pdv_comandas_excluidas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_comandas_excluidas_empresa_idx on public.pdv_comandas_excluidas (empresa_id);
drop policy if exists "pce_all" on public.pdv_comandas_excluidas;
create policy pdv_comandas_excluidas_empresa on public.pdv_comandas_excluidas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_config (27 linhas)
alter table public.pdv_config
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_config_empresa_idx on public.pdv_config (empresa_id);
drop policy if exists "pdv_config_all" on public.pdv_config;
create policy pdv_config_empresa on public.pdv_config for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_item_grupos (28 linhas)
alter table public.pdv_item_grupos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_item_grupos_empresa_idx on public.pdv_item_grupos (empresa_id);
drop policy if exists "pdv_compl_all" on public.pdv_item_grupos;
create policy pdv_item_grupos_empresa on public.pdv_item_grupos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_item_opcoes (472 linhas)
alter table public.pdv_item_opcoes
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_item_opcoes_empresa_idx on public.pdv_item_opcoes (empresa_id);
drop policy if exists "pdv_compl_all" on public.pdv_item_opcoes;
create policy pdv_item_opcoes_empresa on public.pdv_item_opcoes for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_itens (115 linhas)
alter table public.pdv_itens
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_itens_empresa_idx on public.pdv_itens (empresa_id);
drop policy if exists "pdv_itens_all" on public.pdv_itens;
create policy pdv_itens_empresa on public.pdv_itens for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_itens_cancelados (10 linhas)
alter table public.pdv_itens_cancelados
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_itens_cancelados_empresa_idx on public.pdv_itens_cancelados (empresa_id);
drop policy if exists "pic_all" on public.pdv_itens_cancelados;
create policy pdv_itens_cancelados_empresa on public.pdv_itens_cancelados for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_pizza_borda_precos (56 linhas)
alter table public.pdv_pizza_borda_precos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_pizza_borda_precos_empresa_idx on public.pdv_pizza_borda_precos (empresa_id);
drop policy if exists "pdv_pizza_all" on public.pdv_pizza_borda_precos;
create policy pdv_pizza_borda_precos_empresa on public.pdv_pizza_borda_precos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_pizza_bordas (14 linhas)
alter table public.pdv_pizza_bordas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_pizza_bordas_empresa_idx on public.pdv_pizza_bordas (empresa_id);
drop policy if exists "pdv_pizza_all" on public.pdv_pizza_bordas;
create policy pdv_pizza_bordas_empresa on public.pdv_pizza_bordas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_pizza_sabor_precos (380 linhas)
alter table public.pdv_pizza_sabor_precos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_pizza_sabor_precos_empresa_idx on public.pdv_pizza_sabor_precos (empresa_id);
drop policy if exists "pdv_pizza_all" on public.pdv_pizza_sabor_precos;
create policy pdv_pizza_sabor_precos_empresa on public.pdv_pizza_sabor_precos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_pizza_sabores (95 linhas)
alter table public.pdv_pizza_sabores
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_pizza_sabores_empresa_idx on public.pdv_pizza_sabores (empresa_id);
drop policy if exists "pdv_pizza_all" on public.pdv_pizza_sabores;
create policy pdv_pizza_sabores_empresa on public.pdv_pizza_sabores for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pdv_pizza_tamanhos (4 linhas)
alter table public.pdv_pizza_tamanhos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pdv_pizza_tamanhos_empresa_idx on public.pdv_pizza_tamanhos (empresa_id);
drop policy if exists "pdv_pizza_all" on public.pdv_pizza_tamanhos;
create policy pdv_pizza_tamanhos_empresa on public.pdv_pizza_tamanhos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pedidos_rodizio (52 linhas)
alter table public.pedidos_rodizio
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pedidos_rodizio_empresa_idx on public.pedidos_rodizio (empresa_id);
drop policy if exists "pedidos_rodizio_auth" on public.pedidos_rodizio;
create policy pedidos_rodizio_empresa on public.pedidos_rodizio for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- tv_recados (2 linhas)
alter table public.tv_recados
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists tv_recados_empresa_idx on public.tv_recados (empresa_id);
drop policy if exists "tv_recados_auth" on public.tv_recados;
create policy tv_recados_empresa on public.tv_recados for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());


-- ---------- Nome de categoria e ajuste do PDV passam a repetir entre empresas ----------
-- Dois restaurantes podem ter uma categoria "Bebidas", e cada um precisa do
-- seu próprio ajuste de PDV. (Nomes conferidos no banco antes de remover: já
-- perdi tempo duas vezes chutando nome de restrição que não existia.)
alter table public.pdv_categorias drop constraint if exists pdv_categorias_nome_key;
create unique index if not exists pdv_categorias_empresa_nome_key
  on public.pdv_categorias (empresa_id, nome);

alter table public.pdv_config drop constraint pdv_config_pkey;
alter table public.pdv_config
  add constraint pdv_config_pkey primary key (empresa_id, chave);

-- O preço da borda e do sabor por tamanho ficam como estão de propósito: a
-- borda, o sabor e o tamanho já pertencem a uma empresa, então o par nunca se
-- repete entre restaurantes diferentes.
