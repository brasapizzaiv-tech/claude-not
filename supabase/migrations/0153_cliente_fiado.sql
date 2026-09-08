-- "Saldo cliente" no caixa: a conta vai pro fiado do cliente pra cobrar depois.
-- debito = venda fiada (comanda); pagamento = o cliente acertou (entra no caixa
-- do dia com a forma usada).
create table if not exists public.cliente_fiado (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null check (tipo in ('debito', 'pagamento')),
  valor numeric(12,2) not null,
  descricao text,
  comanda_id uuid references public.pdv_comandas(id) on delete set null,
  forma_pagamento text,
  caixa_id uuid references public.pdv_caixas(id) on delete set null,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index if not exists cliente_fiado_cliente_idx on public.cliente_fiado (cliente_id, criado_em desc);
alter table public.cliente_fiado enable row level security;
drop policy if exists "cliente_fiado_auth" on public.cliente_fiado;
create policy "cliente_fiado_auth" on public.cliente_fiado for all to authenticated using (true) with check (true);
