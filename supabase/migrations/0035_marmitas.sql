-- Sistema de Marmitas (portado do Worker Cloudflare "marmitas-kern").
-- Isolado com prefixo mkt_ para não colidir com pedidos/colaboradores do ERP.
-- Config em chave/valor (valores em JSON quando lista); pedidos das marmitas.

create table if not exists public.mkt_config (
  chave text primary key,
  valor text
);

create table if not exists public.mkt_pedidos (
  id             text primary key,
  data           text not null,
  filial         text not null,
  colaborador_id text,
  cliente        text not null,
  matricula      text,
  pratos         text,   -- JSON: lista de nomes (1 a 4)
  proteina       text,   -- nome da proteína ou ''
  salada         text,   -- nome da salada ou ''
  origem         text,   -- 'colaborador' | 'buffet'
  criado_em      text
);
create index if not exists idx_mkt_pedidos_data on public.mkt_pedidos (data);
create index if not exists idx_mkt_pedidos_colab on public.mkt_pedidos (data, colaborador_id);

-- RLS ligado sem políticas: só o service_role (usado pela rota /api/marmitas) acessa.
alter table public.mkt_config enable row level security;
alter table public.mkt_pedidos enable row level security;
