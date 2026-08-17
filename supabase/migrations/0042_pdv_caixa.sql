-- Salão/PDV — Frente de Caixa: sessões de caixa + movimentos (venda/suprimento/sangria).

create table if not exists public.pdv_caixas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null default 'Caixa',
  saldo_inicial numeric not null default 0,
  status        text not null default 'aberto',   -- 'aberto' | 'fechado'
  aberto_em     timestamptz not null default now(),
  fechado_em    timestamptz
);

create table if not exists public.pdv_caixa_mov (
  id              uuid primary key default gen_random_uuid(),
  caixa_id        uuid not null references public.pdv_caixas (id) on delete cascade,
  tipo            text not null,                  -- 'venda' | 'suprimento' | 'sangria'
  descricao       text,
  forma_pagamento text,
  valor           numeric not null default 0,
  comanda_id      uuid,
  criado_em       timestamptz not null default now()
);

create index if not exists idx_pdv_caixa_mov_caixa on public.pdv_caixa_mov (caixa_id);
create index if not exists idx_pdv_caixa_mov_comanda on public.pdv_caixa_mov (comanda_id);

do $$
declare t text;
begin
  foreach t in array array['pdv_caixas','pdv_caixa_mov'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      drop policy if exists "pdv_caixa_all" on public.%I;
      create policy "pdv_caixa_all" on public.%I for all to authenticated using (true) with check (true);
    $p$, t, t);
  end loop;
end $$;
