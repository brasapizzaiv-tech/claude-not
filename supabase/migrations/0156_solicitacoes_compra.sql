-- Pedidos de compra da equipe: o colaborador pede pelo app (/eu) o que precisa
-- repor (equipamento, utensílio, material); o dono vê a lista no painel,
-- filtra e marca como comprado ou rejeita (com resposta que a pessoa vê).
create table if not exists public.solicitacoes_compra (
  id             bigint generated always as identity primary key,
  colaborador_id uuid references public.colaboradores (id) on delete set null,
  nome           text not null,                 -- quem pediu (denormalizado p/ histórico)
  item           text not null,                 -- o que precisa
  quantidade     text,                          -- "2", "1 caixa", livre
  motivo         text,                          -- pra quê / observação
  urgente        boolean not null default false,
  status         text not null default 'pendente' check (status in ('pendente', 'comprado', 'rejeitado')),
  resposta       text,                          -- recado do dono (motivo da rejeição, onde comprou...)
  respondido_em  timestamptz,
  respondido_por uuid,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_solicitacoes_compra_status on public.solicitacoes_compra (status);
create index if not exists idx_solicitacoes_compra_colab on public.solicitacoes_compra (colaborador_id);

alter table public.solicitacoes_compra enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='solicitacoes_compra' and policyname='solicitacoes_compra_all') then
    create policy solicitacoes_compra_all on public.solicitacoes_compra for all to authenticated using (true) with check (true);
  end if;
end $$;
