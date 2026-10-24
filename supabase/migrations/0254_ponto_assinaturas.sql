-- ASSINATURA DO ESPELHO DE PONTO no app da equipe (Rafael, 24/10/2026: sair do
-- RHiD). Fechado o ciclo (21 a 20), cada um confere o próprio ponto no /eu e
-- assina ("está certo") ou diz que não concorda, com o motivo. Fica guardado o
-- resumo que a pessoa viu e uma impressão digital (hash) dele: se alguém
-- ajustar o ponto depois, o painel mostra "mudou depois da assinatura" e o app
-- pede pra assinar de novo. Nunca se apaga: cada resposta é uma linha nova.
create table if not exists public.ponto_assinaturas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  de             date not null,
  ate            date not null,
  resposta       text not null check (resposta in ('assinado', 'discorda')),
  comentario     text,
  resumo         jsonb not null,
  hash           text not null,
  ip             text,
  aparelho       text,
  criado_em      timestamptz not null default now()
);
create index if not exists ponto_assinaturas_pessoa_idx on public.ponto_assinaturas (colaborador_id, de, criado_em desc);
create index if not exists ponto_assinaturas_empresa_idx on public.ponto_assinaturas (empresa_id, de);

alter table public.ponto_assinaturas enable row level security;
drop policy if exists ponto_assinaturas_empresa on public.ponto_assinaturas;
create policy ponto_assinaturas_empresa on public.ponto_assinaturas for select to authenticated
  using (empresa_id = public.empresa_atual());
-- O painel só lê; quem grava é o app da equipe (servidor, com o PIN conferido).
grant select on public.ponto_assinaturas to authenticated;
grant select, insert on public.ponto_assinaturas to service_role;
