-- Ajudante (IA do painel), etapa 1: só responde "como faço" pelo manual do
-- sistema, não vê dados. Esta tabela guarda cada pergunta e quanto custou,
-- pra aplicar o limite do dia e o dono acompanhar o gasto.
--
-- Quem grava é o servidor (cliente admin, depois de conferir o login). A
-- sessão do usuário só lê, e só o dono, só da própria empresa.

create table if not exists public.ajudante_uso (
  id bigint generated always as identity primary key,
  empresa_id uuid not null default public.empresa_atual() references public.empresas(id),
  user_id uuid not null,
  criado_em timestamptz not null default now(),
  pergunta text,
  tela text,
  modelo text,
  tokens_entrada integer not null default 0,
  tokens_cache_escrita integer not null default 0,
  tokens_cache_leitura integer not null default 0,
  tokens_saida integer not null default 0,
  custo_usd numeric(10, 5) not null default 0,
  erro text
);

create index if not exists ajudante_uso_empresa_dia on public.ajudante_uso (empresa_id, criado_em desc);
create index if not exists ajudante_uso_user_dia on public.ajudante_uso (user_id, criado_em desc);

alter table public.ajudante_uso enable row level security;

drop policy if exists ajudante_uso_dono_le on public.ajudante_uso;
create policy ajudante_uso_dono_le on public.ajudante_uso
  for select to authenticated
  using (empresa_id = public.empresa_atual() and (select public.sou_dono()));
