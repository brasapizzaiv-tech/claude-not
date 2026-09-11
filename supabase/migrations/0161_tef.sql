-- TEF (cartão integrado ao pinpad). Cada pagamento em cartão feito pelo TEF
-- guarda o que a maquininha devolveu; a tabela tef_transacoes é o histórico
-- completo (inclusive negadas/desfeitas) e serve pra reimprimir o comprovante.
alter table public.pdv_caixa_mov
  add column if not exists tef_nsu         text,
  add column if not exists tef_autorizacao text,
  add column if not exists tef_rede        text,
  add column if not exists tef_terminal    text;

create table if not exists public.tef_transacoes (
  id            uuid primary key default gen_random_uuid(),
  caixa_id      uuid references public.pdv_caixas (id) on delete set null,
  comanda_ids   uuid[],
  mov_id        uuid references public.pdv_caixa_mov (id) on delete set null,
  terminal      text,
  hostname      text,
  tipo          text,                      -- credito | debito | voucher
  valor         numeric(12,2) not null,
  parcelas      integer not null default 1,
  rede          text,
  bandeira      text,
  produto       text,
  nsu           text,
  nsu_host      text,
  autorizacao   text,
  pan_mascarado text,
  status        text not null check (status in ('aprovada', 'confirmada', 'desfeita', 'negada', 'cancelada', 'erro')),
  mensagem      text,
  via_cliente   text[],
  via_loja      text[],
  id_agente     text,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists tef_transacoes_caixa on public.tef_transacoes (caixa_id, criado_em desc);
create index if not exists tef_transacoes_nsu on public.tef_transacoes (nsu);
alter table public.tef_transacoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tef_transacoes' and policyname='tef_transacoes_all') then
    create policy tef_transacoes_all on public.tef_transacoes for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Heartbeat dos agentes TEF (um por PC).
create table if not exists public.tef_status (
  terminal    text primary key,
  hostname    text,
  versao      text,
  gerenciador boolean,
  etapa       text,
  visto_em    timestamptz not null default now()
);
alter table public.tef_status enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tef_status' and policyname='tef_status_all') then
    create policy tef_status_all on public.tef_status for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Comprovante do cartão sai pela Central de Impressões (tipo novo na fila).
alter table public.impressao_fila drop constraint if exists impressao_fila_tipo_check;
alter table public.impressao_fila add constraint impressao_fila_tipo_check
  check (tipo in ('etiqueta', 'comanda', 'teste', 'teste_etiqueta', 'marmita', 'nfce', 'fechamento', 'tef'));
