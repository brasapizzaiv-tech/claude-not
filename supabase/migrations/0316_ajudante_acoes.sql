-- Ajudante, etapa 3: ações que a IA PREPARA e a pessoa confirma num botão.
-- Cada pedido fica aqui como "pendente"; só o clique em Confirmar (rota
-- /api/ajudante/acao, conferindo que é a mesma pessoa e que não venceu) roda
-- a ação, usando a mesma função da tela do painel. Fica o histórico de quem
-- confirmou o quê.
--
-- Quem grava é o servidor (cliente admin, depois de conferir o login). A
-- sessão só lê, e só o dono, só da própria empresa.

create table if not exists public.ajudante_acoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas(id),
  user_id uuid not null,
  criado_em timestamptz not null default now(),
  acao text not null,
  resumo text not null,
  detalhes text[] not null default '{}',
  dados jsonb not null default '{}'::jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'executando', 'feita', 'cancelada', 'erro', 'vencida')),
  decidido_em timestamptz,
  resultado text
);

create index if not exists ajudante_acoes_empresa on public.ajudante_acoes (empresa_id, criado_em desc);

alter table public.ajudante_acoes enable row level security;

drop policy if exists ajudante_acoes_dono_le on public.ajudante_acoes;
create policy ajudante_acoes_dono_le on public.ajudante_acoes
  for select to authenticated
  using (empresa_id = public.empresa_atual() and (select public.sou_dono()));
