-- Recados da TV da cozinha: fora do rodízio (ou sem pedido na fila) a TV vira
-- relógio + painel de recados, no lugar do relógio de parede que saiu.
create table if not exists public.tv_recados (
  id         uuid primary key default gen_random_uuid(),
  texto      text not null,
  ativo      boolean not null default true,
  ordem      integer not null default 0,
  ate        date,                              -- some sozinho depois desta data (opcional)
  criado_em  timestamptz not null default now()
);

alter table public.tv_recados enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='tv_recados' and policyname='tv_recados_auth') then
    create policy tv_recados_auth on public.tv_recados for all to authenticated using (true) with check (true);
  end if;
end $$;
