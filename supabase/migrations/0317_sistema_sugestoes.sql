-- Sugestões para o sistema: quando alguém pergunta ao Ajudante como fazer
-- algo que o sistema ainda não tem, o Ajudante oferece mandar a ideia pro
-- desenvolvedor. A pessoa confirma no cartão e a sugestão cai aqui; o dono vê
-- em Configurações → Sugestões do sistema (com o numerozinho no menu).

create table if not exists public.sistema_sugestoes (
  id bigint generated always as identity primary key,
  empresa_id uuid not null default public.empresa_atual() references public.empresas(id),
  user_id uuid not null default auth.uid(),
  nome text not null,
  pedido text not null check (char_length(pedido) between 3 and 1000),
  contexto text check (contexto is null or char_length(contexto) <= 2000),
  tela text,
  status text not null default 'pendente' check (status in ('pendente', 'feito', 'descartado')),
  resposta text,
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);

create index if not exists sistema_sugestoes_empresa on public.sistema_sugestoes (empresa_id, status, criado_em desc);

alter table public.sistema_sugestoes enable row level security;

-- Qualquer login da empresa manda a sua (pelo Ajudante, com a sessão dele).
drop policy if exists sistema_sugestoes_insere on public.sistema_sugestoes;
create policy sistema_sugestoes_insere on public.sistema_sugestoes
  for insert to authenticated
  with check (empresa_id = public.empresa_atual() and user_id = auth.uid() and status = 'pendente');

-- Só o dono lê e responde.
drop policy if exists sistema_sugestoes_dono on public.sistema_sugestoes;
create policy sistema_sugestoes_dono on public.sistema_sugestoes
  for select to authenticated
  using (empresa_id = public.empresa_atual() and (select public.sou_dono()));

drop policy if exists sistema_sugestoes_dono_responde on public.sistema_sugestoes;
create policy sistema_sugestoes_dono_responde on public.sistema_sugestoes
  for update to authenticated
  using (empresa_id = public.empresa_atual() and (select public.sou_dono()))
  with check (empresa_id = public.empresa_atual() and (select public.sou_dono()));
