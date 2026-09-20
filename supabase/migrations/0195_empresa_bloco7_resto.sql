-- ETAPA 2 DO MULTIEMPRESA — bloco 7: cardapio do dia, etiquetas, reservas, impressao, balanca e marmitas
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

-- balanca_status (1 linhas)
alter table public.balanca_status
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists balanca_status_empresa_idx on public.balanca_status (empresa_id);
drop policy if exists "bs_read" on public.balanca_status;
create policy balanca_status_empresa on public.balanca_status for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- cardapio_dia (22 linhas)
alter table public.cardapio_dia
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists cardapio_dia_empresa_idx on public.cardapio_dia (empresa_id);
drop policy if exists "cardapio_dia_all" on public.cardapio_dia;
create policy cardapio_dia_empresa on public.cardapio_dia for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- cardapio_dia_saladas (12 linhas)
alter table public.cardapio_dia_saladas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists cardapio_dia_saladas_empresa_idx on public.cardapio_dia_saladas (empresa_id);
drop policy if exists "cardapio_dia_saladas_auth" on public.cardapio_dia_saladas;
create policy cardapio_dia_saladas_empresa on public.cardapio_dia_saladas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- cardapio_itens (291 linhas)
alter table public.cardapio_itens
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists cardapio_itens_empresa_idx on public.cardapio_itens (empresa_id);
drop policy if exists "cardapio_itens_all" on public.cardapio_itens;
create policy cardapio_itens_empresa on public.cardapio_itens for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- etiqueta_categorias (23 linhas)
alter table public.etiqueta_categorias
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists etiqueta_categorias_empresa_idx on public.etiqueta_categorias (empresa_id);
drop policy if exists "etc_all" on public.etiqueta_categorias;
create policy etiqueta_categorias_empresa on public.etiqueta_categorias for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- etiqueta_itens (255 linhas)
alter table public.etiqueta_itens
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists etiqueta_itens_empresa_idx on public.etiqueta_itens (empresa_id);
drop policy if exists "eti_all" on public.etiqueta_itens;
create policy etiqueta_itens_empresa on public.etiqueta_itens for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- etiquetas (620 linhas)
alter table public.etiquetas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists etiquetas_empresa_idx on public.etiquetas (empresa_id);
drop policy if exists "et_all" on public.etiquetas;
create policy etiquetas_empresa on public.etiquetas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- impressao_config (1 linhas)
alter table public.impressao_config
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists impressao_config_empresa_idx on public.impressao_config (empresa_id);
create policy impressao_config_empresa on public.impressao_config for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- impressao_fila (1509 linhas)
alter table public.impressao_fila
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists impressao_fila_empresa_idx on public.impressao_fila (empresa_id);
drop policy if exists "impressao_fila_all" on public.impressao_fila;
create policy impressao_fila_empresa on public.impressao_fila for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- impressoras (4 linhas)
alter table public.impressoras
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists impressoras_empresa_idx on public.impressoras (empresa_id);
drop policy if exists "impressoras_all" on public.impressoras;
create policy impressoras_empresa on public.impressoras for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- mkt_config (12 linhas)
alter table public.mkt_config
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists mkt_config_empresa_idx on public.mkt_config (empresa_id);
create policy mkt_config_empresa on public.mkt_config for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- mkt_pedidos (1686 linhas)
alter table public.mkt_pedidos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists mkt_pedidos_empresa_idx on public.mkt_pedidos (empresa_id);
create policy mkt_pedidos_empresa on public.mkt_pedidos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- reservas (94 linhas)
alter table public.reservas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists reservas_empresa_idx on public.reservas (empresa_id);
drop policy if exists "reservas_all" on public.reservas;
create policy reservas_empresa on public.reservas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- reservas_bloqueios (0 linhas)
alter table public.reservas_bloqueios
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists reservas_bloqueios_empresa_idx on public.reservas_bloqueios (empresa_id);
drop policy if exists "reservas_bloq_all" on public.reservas_bloqueios;
create policy reservas_bloqueios_empresa on public.reservas_bloqueios for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- reservas_config (3 linhas)
alter table public.reservas_config
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists reservas_config_empresa_idx on public.reservas_config (empresa_id);
drop policy if exists "reservas_cfg_all" on public.reservas_config;
create policy reservas_config_empresa on public.reservas_config for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- reservas_limites (2 linhas)
alter table public.reservas_limites
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists reservas_limites_empresa_idx on public.reservas_limites (empresa_id);
drop policy if exists "reservas_lim_all" on public.reservas_limites;
create policy reservas_limites_empresa on public.reservas_limites for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- saladas_base (27 linhas)
alter table public.saladas_base
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists saladas_base_empresa_idx on public.saladas_base (empresa_id);
drop policy if exists "saladas_base_auth" on public.saladas_base;
create policy saladas_base_empresa on public.saladas_base for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- saladas_semana (66 linhas)
alter table public.saladas_semana
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists saladas_semana_empresa_idx on public.saladas_semana (empresa_id);
drop policy if exists "saladas_semana_auth" on public.saladas_semana;
create policy saladas_semana_empresa on public.saladas_semana for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());


-- ---------- Sete chaves passam a valer dentro da empresa ----------
-- Dois restaurantes servem cardápio no mesmo dia, podem ter uma salada
-- "Maionese", uma categoria de etiqueta "Molhos" e um turno "noite".
alter table public.cardapio_dia drop constraint cardapio_dia_pkey;
alter table public.cardapio_dia
  add constraint cardapio_dia_pkey primary key (empresa_id, data);

alter table public.mkt_config drop constraint mkt_config_pkey;
alter table public.mkt_config
  add constraint mkt_config_pkey primary key (empresa_id, chave);

alter table public.reservas_config drop constraint reservas_config_pkey;
alter table public.reservas_config
  add constraint reservas_config_pkey primary key (empresa_id, chave);

alter table public.reservas_limites drop constraint reservas_limites_pkey;
alter table public.reservas_limites
  add constraint reservas_limites_pkey primary key (empresa_id, turno);

alter table public.cardapio_itens drop constraint if exists cardapio_itens_grupo_nome_key;
create unique index if not exists cardapio_itens_empresa_grupo_nome_key
  on public.cardapio_itens (empresa_id, grupo, nome);

alter table public.etiqueta_categorias drop constraint if exists etiqueta_categorias_nome_key;
create unique index if not exists etiqueta_categorias_empresa_nome_key
  on public.etiqueta_categorias (empresa_id, nome);

alter table public.saladas_base drop constraint if exists saladas_base_nome_key;
create unique index if not exists saladas_base_empresa_nome_key
  on public.saladas_base (empresa_id, nome);

-- ---------- Estação de impressão e balança: uma por restaurante ----------
-- As duas guardavam UMA linha só, achada por `id = 1`, como era o delivery.
-- Cada restaurante tem o PC dele.
create unique index if not exists impressao_config_empresa_key
  on public.impressao_config (empresa_id);
create unique index if not exists balanca_status_empresa_key
  on public.balanca_status (empresa_id);

-- Ficam como estão de propósito: cardápio do dia por salada, salada da
-- semana e marmita por colaborador — todos partem de uma salada ou de uma
-- pessoa, que já pertencem a uma empresa.
