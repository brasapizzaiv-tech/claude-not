-- ETAPA 2 DO MULTIEMPRESA — bloco 6: equipe
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

-- folgas_ajustes (10 linhas)
alter table public.folgas_ajustes
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists folgas_ajustes_empresa_idx on public.folgas_ajustes (empresa_id);
drop policy if exists "folgas_gestao" on public.folgas_ajustes;
create policy folgas_ajustes_empresa on public.folgas_ajustes for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- folgas_bloqueios (3 linhas)
alter table public.folgas_bloqueios
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists folgas_bloqueios_empresa_idx on public.folgas_bloqueios (empresa_id);
drop policy if exists "folgas_gestao" on public.folgas_bloqueios;
create policy folgas_bloqueios_empresa on public.folgas_bloqueios for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- folgas_funcionarios (42 linhas)
alter table public.folgas_funcionarios
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists folgas_funcionarios_empresa_idx on public.folgas_funcionarios (empresa_id);
drop policy if exists "folgas_gestao" on public.folgas_funcionarios;
create policy folgas_funcionarios_empresa on public.folgas_funcionarios for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- folgas_limites (35 linhas)
alter table public.folgas_limites
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists folgas_limites_empresa_idx on public.folgas_limites (empresa_id);
drop policy if exists "folgas_gestao" on public.folgas_limites;
create policy folgas_limites_empresa on public.folgas_limites for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- folgas_pedidos (44 linhas)
alter table public.folgas_pedidos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists folgas_pedidos_empresa_idx on public.folgas_pedidos (empresa_id);
drop policy if exists "folgas_gestao" on public.folgas_pedidos;
create policy folgas_pedidos_empresa on public.folgas_pedidos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- presencas (313 linhas)
alter table public.presencas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists presencas_empresa_idx on public.presencas (empresa_id);
drop policy if exists "pres_all" on public.presencas;
create policy presencas_empresa on public.presencas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- presencas_folgas (3 linhas)
alter table public.presencas_folgas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists presencas_folgas_empresa_idx on public.presencas_folgas (empresa_id);
drop policy if exists "presencas_folgas_auth" on public.presencas_folgas;
create policy presencas_folgas_empresa on public.presencas_folgas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- semana_extras (17 linhas)
alter table public.semana_extras
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists semana_extras_empresa_idx on public.semana_extras (empresa_id);
drop policy if exists "se_all" on public.semana_extras;
create policy semana_extras_empresa on public.semana_extras for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- semana_pagamentos (60 linhas)
alter table public.semana_pagamentos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists semana_pagamentos_empresa_idx on public.semana_pagamentos (empresa_id);
drop policy if exists "sp_all" on public.semana_pagamentos;
create policy semana_pagamentos_empresa on public.semana_pagamentos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- dez_por_cento_noites (6 linhas)
alter table public.dez_por_cento_noites
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists dez_por_cento_noites_empresa_idx on public.dez_por_cento_noites (empresa_id);
drop policy if exists "dez_all" on public.dez_por_cento_noites;
create policy dez_por_cento_noites_empresa on public.dez_por_cento_noites for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- retiradas (212 linhas)
alter table public.retiradas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists retiradas_empresa_idx on public.retiradas (empresa_id);
drop policy if exists "retiradas_all" on public.retiradas;
create policy retiradas_empresa on public.retiradas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- retirada_produtos (46 linhas)
alter table public.retirada_produtos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists retirada_produtos_empresa_idx on public.retirada_produtos (empresa_id);
drop policy if exists "retirada_produtos_all" on public.retirada_produtos;
create policy retirada_produtos_empresa on public.retirada_produtos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- solicitacoes_compra (5 linhas)
alter table public.solicitacoes_compra
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists solicitacoes_compra_empresa_idx on public.solicitacoes_compra (empresa_id);
drop policy if exists "solicitacoes_compra_all" on public.solicitacoes_compra;
create policy solicitacoes_compra_empresa on public.solicitacoes_compra for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());


-- ---------- As regras de "não pode repetir" da equipe ----------
-- Seis coisas aqui eram únicas no banco inteiro e precisam ser únicas DENTRO
-- da empresa: dois restaurantes têm noites no mesmo dia, têm dias de folga no
-- mesmo dia, podem ter uma funcionária chamada Maria e um produto de retirada
-- chamado "Refrigerante 2L".
--
-- (Nomes conferidos no banco antes de escrever cada remoção — chutar nome de
-- restrição já me custou duas migrations de conserto.)

alter table public.dez_por_cento_noites drop constraint dez_por_cento_noites_pkey;
alter table public.dez_por_cento_noites
  add constraint dez_por_cento_noites_pkey primary key (empresa_id, data);

alter table public.folgas_ajustes drop constraint folgas_ajustes_pkey;
alter table public.folgas_ajustes
  add constraint folgas_ajustes_pkey primary key (empresa_id, data, grupo);

alter table public.folgas_bloqueios drop constraint folgas_bloqueios_pkey;
alter table public.folgas_bloqueios
  add constraint folgas_bloqueios_pkey primary key (empresa_id, data);

alter table public.folgas_limites drop constraint folgas_limites_pkey;
alter table public.folgas_limites
  add constraint folgas_limites_pkey primary key (empresa_id, grupo, dia_semana);

alter table public.folgas_funcionarios drop constraint if exists folgas_funcionarios_nome_key;
create unique index if not exists folgas_funcionarios_empresa_nome_key
  on public.folgas_funcionarios (empresa_id, nome);

alter table public.retirada_produtos drop constraint if exists retirada_produtos_nome_key;
create unique index if not exists retirada_produtos_empresa_nome_key
  on public.retirada_produtos (empresa_id, nome);

-- Ficam como estão de propósito:
--   • o token do link pessoal da folga — é um link, e leva a um lugar só;
--   • presença, pedido de folga e extra da semana — todos partem do
--     colaborador ou do funcionário, que já pertence a uma empresa.
