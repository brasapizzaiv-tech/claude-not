-- Correção manual do valor de Compras no CMV Real, por semana (contagem final)
-- e por produto. Serve para quando uma compra "cai fora" da captura automática
-- (nota/pedido) e o usuário precisa preencher o valor à mão.
create table if not exists public.cmv_compras_manual (
  id           uuid primary key default gen_random_uuid(),
  contagem_id  uuid not null references public.contagens(id) on delete cascade,
  produto_id   uuid not null references public.produtos(id) on delete cascade,
  valor        numeric not null default 0,
  criado_em    timestamptz not null default now(),
  unique (contagem_id, produto_id)
);

alter table public.cmv_compras_manual enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'cmv_compras_manual' and policyname = 'ccm_all'
  ) then
    create policy "ccm_all" on public.cmv_compras_manual
      for all to authenticated using (true) with check (true);
  end if;
end $$;
