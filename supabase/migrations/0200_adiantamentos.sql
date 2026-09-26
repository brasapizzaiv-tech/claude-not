-- Adiantamento de salário/diária pra um colaborador.
--
-- É dinheiro dado ANTES do acerto e descontado no acerto seguinte da tela
-- Semana e 10%. Não vai junto com as compras internas (retiradas) de
-- propósito: tem gente cujo fiado das compras é descontado só uma vez por mês,
-- e o adiantamento tem que sair já na próxima semana, separado.
--
-- A conta no Contas a pagar continua com o valor CHEIO da semana (mão de obra
-- do mês); o adiantamento só reduz o que sai em mãos — mesma regra do fiado.
create table if not exists public.adiantamentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  nome           text not null,                       -- nome da pessoa (denormalizado, p/ histórico)
  valor          numeric not null check (valor > 0),
  data           date not null,                       -- dia em que o dinheiro foi dado
  motivo         text,
  status         text not null default 'aberto' check (status in ('aberto', 'descontado')),
  descontado_em  date,                                -- segunda da semana em que foi descontado
  pagamento_id   uuid references public.semana_pagamentos (id) on delete set null,
  criado_por     uuid,
  criado_em      timestamptz not null default now()
);
create index if not exists adiantamentos_colaborador_idx on public.adiantamentos (colaborador_id, status);
create index if not exists adiantamentos_empresa_idx on public.adiantamentos (empresa_id);

alter table public.adiantamentos enable row level security;
drop policy if exists adiantamentos_empresa on public.adiantamentos;
create policy adiantamentos_empresa on public.adiantamentos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());
