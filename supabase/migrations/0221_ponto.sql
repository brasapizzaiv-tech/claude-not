-- PONTO: batidas do relógio Control iD (iDFace, REP-P) viram presença.
--
-- O agente de impressão (PC central) lê o AFD do relógio pela rede da Brasa a
-- cada 5 minutos e manda as batidas novas pra /api/ponto/batidas. O sistema
-- acha a pessoa pelo CPF (ou, na primeira vez, pelo nome cadastrado no
-- relógio) e, se ela está marcada "bate ponto", marca a presença do turno:
-- antes das 16h = dia; das 16h às 04:59 = noite (saída depois da meia-noite
-- conta na noite do dia anterior).
--
-- Quem não bate ponto continua com a presença marcada à mão, como sempre.
alter table public.colaboradores
  add column if not exists bate_ponto boolean not null default false,
  add column if not exists cpf text;
create index if not exists colaboradores_cpf_idx on public.colaboradores (cpf);

create table if not exists public.ponto_batidas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  equipamento    text not null,            -- número de série do relógio
  nsr            bigint not null,          -- número sequencial do registro (AFD)
  data_hora      timestamptz not null,
  cpf            text not null,
  nome           text,                     -- nome cadastrado no relógio
  colaborador_id uuid references public.colaboradores (id) on delete set null,
  data           date not null,            -- dia do turno (noite que passa da meia-noite = dia anterior)
  turno          text not null check (turno in ('dia', 'noite')),
  presenca       boolean not null default false, -- já marcou a presença
  criado_em      timestamptz not null default now(),
  unique (empresa_id, equipamento, nsr)
);
create index if not exists ponto_batidas_data_idx on public.ponto_batidas (empresa_id, data);
create index if not exists ponto_batidas_cpf_idx on public.ponto_batidas (cpf);

alter table public.ponto_batidas enable row level security;
drop policy if exists ponto_batidas_empresa on public.ponto_batidas;
create policy ponto_batidas_empresa on public.ponto_batidas for all to authenticated
  using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual());
grant select, insert, update, delete on public.ponto_batidas to authenticated, service_role;

-- Presença que veio do ponto (pra tela mostrar de onde veio).
alter table public.presencas add column if not exists origem text not null default 'manual';
