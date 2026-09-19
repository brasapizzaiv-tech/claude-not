-- ETAPA 2 DO MULTIEMPRESA — bloco 3: financeiro
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

-- lancamentos (3043 linhas)
alter table public.lancamentos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists lancamentos_empresa_idx on public.lancamentos (empresa_id);
drop policy if exists "lanc_all" on public.lancamentos;
create policy lancamentos_empresa on public.lancamentos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- dre_categorias (117 linhas)
alter table public.dre_categorias
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists dre_categorias_empresa_idx on public.dre_categorias (empresa_id);
drop policy if exists "dre_cat_all" on public.dre_categorias;
create policy dre_categorias_empresa on public.dre_categorias for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- transacoes_banco (788 linhas)
alter table public.transacoes_banco
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists transacoes_banco_empresa_idx on public.transacoes_banco (empresa_id);
drop policy if exists "tb_all" on public.transacoes_banco;
create policy transacoes_banco_empresa on public.transacoes_banco for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- faturamento_dia (281 linhas)
alter table public.faturamento_dia
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists faturamento_dia_empresa_idx on public.faturamento_dia (empresa_id);
drop policy if exists "fd_all" on public.faturamento_dia;
create policy faturamento_dia_empresa on public.faturamento_dia for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- faturamento_dias (53 linhas)
alter table public.faturamento_dias
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists faturamento_dias_empresa_idx on public.faturamento_dias (empresa_id);
drop policy if exists "fd_all" on public.faturamento_dias;
create policy faturamento_dias_empresa on public.faturamento_dias for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- fatura_regras (15 linhas)
alter table public.fatura_regras
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists fatura_regras_empresa_idx on public.fatura_regras (empresa_id);
drop policy if exists "fatura_regras_all" on public.fatura_regras;
create policy fatura_regras_empresa on public.fatura_regras for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- fechamentos_caixa (1 linhas)
alter table public.fechamentos_caixa
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists fechamentos_caixa_empresa_idx on public.fechamentos_caixa (empresa_id);
drop policy if exists "fc_all" on public.fechamentos_caixa;
create policy fechamentos_caixa_empresa on public.fechamentos_caixa for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- clientes (3278 linhas)
alter table public.clientes
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists clientes_empresa_idx on public.clientes (empresa_id);
drop policy if exists "cli_all" on public.clientes;
create policy clientes_empresa on public.clientes for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- cliente_fiado (12 linhas)
alter table public.cliente_fiado
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists cliente_fiado_empresa_idx on public.cliente_fiado (empresa_id);
drop policy if exists "cliente_fiado_auth" on public.cliente_fiado;
create policy cliente_fiado_empresa on public.cliente_fiado for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- orcamentos (0 linhas)
alter table public.orcamentos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists orcamentos_empresa_idx on public.orcamentos (empresa_id);
drop policy if exists "orc_all" on public.orcamentos;
create policy orcamentos_empresa on public.orcamentos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());


-- ---------- As regras de "não pode repetir" passam a valer POR EMPRESA ----------
--
-- Cinco tabelas daqui diziam "isto não pode repetir no banco inteiro". Com
-- dois restaurantes, o segundo esbarraria no primeiro: não conseguiria ter
-- uma categoria de DRE com o mesmo nome, nem lançar o faturamento do mesmo
-- dia. Cada uma passa a valer dentro da empresa.
--
-- (Aprendi na 0188 a conferir o nome de cada restrição antes: `drop ... if
-- exists` com o nome errado não dá erro e não faz nada.)

-- Categoria do DRE: "Bebidas" pode existir em cada restaurante.
alter table public.dre_categorias drop constraint if exists dre_categorias_tipo_nome_key;
create unique index if not exists dre_categorias_empresa_tipo_nome_key
  on public.dre_categorias (empresa_id, tipo, nome);

-- Regra de leitura da fatura do cartão: cada um aprende os estabelecimentos
-- dele.
alter table public.fatura_regras drop constraint if exists fatura_regras_padrao_key;
create unique index if not exists fatura_regras_empresa_padrao_key
  on public.fatura_regras (empresa_id, padrao);

-- Faturamento por dia e turno.
alter table public.faturamento_dia drop constraint if exists faturamento_dia_data_turno_key;
create unique index if not exists faturamento_dia_empresa_data_turno_key
  on public.faturamento_dia (empresa_id, data, turno);

-- Aqui a data era a própria chave primária da tabela: sem isto, dois
-- restaurantes não poderiam ter faturamento no mesmo dia.
alter table public.faturamento_dias drop constraint faturamento_dias_pkey;
alter table public.faturamento_dias
  add constraint faturamento_dias_pkey primary key (empresa_id, data);

-- Extrato do banco: o número da transação (fitid) é único por conta, e cada
-- restaurante tem a conta dele.
alter table public.transacoes_banco drop constraint if exists transacoes_banco_banco_fitid_key;
create unique index if not exists transacoes_banco_empresa_banco_fitid_key
  on public.transacoes_banco (empresa_id, banco, fitid);

-- `orcamentos (categoria_id, ano_mes)` fica como está de propósito: a
-- categoria já pertence a uma empresa, então o par nunca se repete entre
-- restaurantes diferentes.
