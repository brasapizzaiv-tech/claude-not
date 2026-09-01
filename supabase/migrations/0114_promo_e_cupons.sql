-- Fase 4 do delivery (parte 1):
-- 1) Preço promocional por produto (vale em TODOS os canais enquanto ativo;
--    no app do cliente aparece com o preço normal riscado).
-- 2) Cupons de desconto do app (código, % ou valor fixo, validade, limite de usos).

alter table public.pdv_itens
  add column if not exists promo_preco numeric;

create table if not exists public.cupons (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  tipo       text not null default 'percent' check (tipo in ('percent', 'valor')),
  valor      numeric not null default 0,
  minimo     numeric,           -- pedido mínimo pra valer (null = sem mínimo)
  validade   date,              -- null = sem prazo
  max_usos   int,               -- null = ilimitado
  usos       int not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

alter table public.cupons enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'cupons' and policyname = 'cupons_all'
  ) then
    create policy "cupons_all" on public.cupons
      for all to authenticated using (true) with check (true);
  end if;
end $$;
