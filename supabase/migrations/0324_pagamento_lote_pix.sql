-- Pagamento da equipe por Pix em lote (pedido do Rafael, 22/11/2026): o sistema
-- gera o arquivo de remessa CNAB 240 (src/lib/cnab240-pix.ts) e o dono importa
-- no Internet Banking do banco, onde confere e aprova. O sistema NÃO paga nada.
--
-- As duas tabelas ficam só no servidor (RLS ligado e sem política): quem lê e
-- grava é a ação da tela Semana, com a permissão Colaboradores conferida, pela
-- chave administrativa presa à empresa (adminDaEmpresa).

-- Conta da empresa no banco e o número sequencial do arquivo (NSA), que o
-- banco exige crescente a cada arquivo.
create table if not exists public.pagamento_lote_config (
  empresa_id   uuid primary key default public.empresa_atual() references public.empresas(id) on delete cascade,
  banco        text not null default '756' check (banco in ('756')),
  convenio     text,
  cnpj         text,
  nome_empresa text,
  agencia      text,
  agencia_dv   text,
  conta        text,
  conta_dv     text,
  nsa          integer not null default 0,
  atualizado_em timestamptz not null default now()
);
alter table public.pagamento_lote_config enable row level security;

-- Cada arquivo gerado: quem entrou, quanto e com qual número (pra conferir o
-- retorno do banco e não repetir pagamento sem querer).
create table if not exists public.pagamento_lote_arquivos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas(id) on delete cascade,
  banco          text not null,
  nsa            integer not null,
  nome_arquivo   text not null,
  segunda        date,
  data_pagamento date not null,
  qtd            integer not null,
  total          numeric(12, 2) not null,
  itens          jsonb not null default '[]'::jsonb,
  criado_por     uuid,
  criado_em      timestamptz not null default now()
);
alter table public.pagamento_lote_arquivos enable row level security;
create index if not exists pagamento_lote_arquivos_empresa_idx on public.pagamento_lote_arquivos (empresa_id, criado_em desc);

notify pgrst, 'reload schema';
