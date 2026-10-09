-- Delivery Etapa 6: CASHBACK (pedido do Rafael, exemplo do Manda Pedido em 09/10/2026).
--
-- O cliente ganha X% do pedido de volta como saldo, que vence em N dias e pode
-- abater até R$ M num pedido seguinte. Regras:
--   * GANHA quando o pedido é ENTREGUE (não na criação: pedido cancelado não dá
--     cashback). Base = itens elegíveis, sem a taxa de entrega, já descontados
--     cupom e o próprio cashback usado. Combos e itens em promoção ficam de
--     fora quando a configuração manda.
--   * USA no app do cliente (/pedir): o valor usado entra como DESCONTO do
--     pedido ("Cashback"), igual ao cupom — sai assim na nota e no DRE.
--   * Cancelou o pedido → o cashback usado volta pro saldo, e o ganho (se já
--     tinha entrado) é desfeito.
--   * O saldo é por CLIENTE (cadastro achado pelo telefone).
--   * Consome primeiro o crédito que vence antes (FIFO por validade).
--
-- NÃO é o "Saldo cliente" (fiado, cliente_fiado): aquilo é dívida do cliente
-- com a casa; isto é crédito da casa com o cliente. Tabelas separadas de
-- propósito.

create table if not exists public.cashback_config (
  empresa_id       uuid primary key default public.empresa_atual() references public.empresas (id),
  ativo            boolean not null default false,
  percentual       numeric not null default 2 check (percentual >= 0 and percentual <= 100),
  max_resgate      numeric check (max_resgate is null or max_resgate >= 0), -- por pedido; null = sem limite
  validade_dias    integer not null default 30 check (validade_dias > 0),
  -- Onde GANHA: 'app' = pedido feito pelo cliente no cardápio online;
  -- 'delivery' = pedido lançado pelo atendente no painel (telefone/WhatsApp).
  canais           text[] not null default '{app}',
  formas_excluidas text[] not null default '{}',  -- nomes de formas de pagamento que não dão cashback
  sem_combos       boolean not null default true,
  sem_promos       boolean not null default true,
  atualizado_em    timestamptz not null default now()
);

create table if not exists public.cashback_mov (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null default public.empresa_atual() references public.empresas (id),
  cliente_id    uuid not null references public.clientes (id) on delete cascade,
  tipo          text not null check (tipo in ('credito', 'resgate')),
  valor         numeric not null check (valor > 0),
  restante      numeric,       -- crédito: quanto ainda pode ser usado
  expira_em     timestamptz,   -- crédito: até quando vale
  pedido_id     uuid references public.delivery_pedidos (id) on delete set null,
  alocacao      jsonb,         -- resgate: [{"credito_id": ..., "valor": ...}] pra devolver se cancelar
  estornado_em  timestamptz,
  obs           text,
  criado_em     timestamptz not null default now()
);
create unique index if not exists cashback_credito_pedido_uq on public.cashback_mov (pedido_id) where tipo = 'credito' and pedido_id is not null;
create unique index if not exists cashback_resgate_pedido_uq on public.cashback_mov (pedido_id) where tipo = 'resgate' and pedido_id is not null;
create index if not exists cashback_mov_cliente_idx on public.cashback_mov (cliente_id, tipo);
create index if not exists cashback_mov_empresa_idx on public.cashback_mov (empresa_id, criado_em desc);

alter table public.delivery_pedidos
  add column if not exists cashback_base    numeric,                     -- valor sobre o qual o % incide (gravado na criação)
  add column if not exists cashback_resgate numeric not null default 0,  -- quanto de cashback este pedido usou
  add column if not exists cashback_ganho   numeric;                     -- quanto este pedido gerou (na entrega)

alter table public.cashback_config enable row level security;
alter table public.cashback_mov enable row level security;
drop policy if exists cashback_config_empresa on public.cashback_config;
create policy cashback_config_empresa on public.cashback_config for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());
drop policy if exists cashback_mov_empresa on public.cashback_mov;
create policy cashback_mov_empresa on public.cashback_mov for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

grant select, insert, update, delete on public.cashback_config, public.cashback_mov to authenticated, service_role;

-- ------------------------------------------------------------------ saldo
create or replace function public.cashback_saldo(p_cliente uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(round(sum(restante), 2), 0)
    from cashback_mov
   where cliente_id = p_cliente
     and tipo = 'credito'
     and estornado_em is null
     and restante > 0
     and expira_em > now();
$$;

-- ------------------------------------------------------------------ usar
-- Consome até p_valor do saldo (o que vence antes primeiro) e registra o
-- resgate ligado ao pedido. Devolve quanto conseguiu usar (pode ser menos
-- se outro pedido gastou no meio-tempo).
create or replace function public.cashback_resgatar(p_cliente uuid, p_pedido uuid, p_valor numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_falta numeric := round(coalesce(p_valor, 0), 2);
  v_usado numeric := 0;
  v_aloc  jsonb := '[]'::jsonb;
  v_emp   uuid;
  r       record;
  v_tira  numeric;
begin
  if v_falta <= 0 then return 0; end if;
  for r in
    select id, restante, empresa_id
      from cashback_mov
     where cliente_id = p_cliente and tipo = 'credito' and estornado_em is null
       and restante > 0 and expira_em > now()
     order by expira_em, criado_em
     for update
  loop
    exit when v_falta <= 0;
    v_tira := least(r.restante, v_falta);
    update cashback_mov set restante = round(restante - v_tira, 2) where id = r.id;
    v_aloc := v_aloc || jsonb_build_object('credito_id', r.id, 'valor', v_tira);
    v_usado := round(v_usado + v_tira, 2);
    v_falta := round(v_falta - v_tira, 2);
    v_emp := r.empresa_id;
  end loop;
  if v_usado > 0 then
    insert into cashback_mov (empresa_id, cliente_id, tipo, valor, pedido_id, alocacao)
    values (v_emp, p_cliente, 'resgate', v_usado, p_pedido, v_aloc);
  end if;
  return v_usado;
end;
$$;

-- ------------------------------------------------------------------ devolver
create or replace function public.cashback_estornar_resgate(p_pedido uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  a jsonb;
begin
  for r in select id, alocacao from cashback_mov
            where pedido_id = p_pedido and tipo = 'resgate' and estornado_em is null
            for update
  loop
    for a in select * from jsonb_array_elements(coalesce(r.alocacao, '[]'::jsonb)) loop
      update cashback_mov
         set restante = round(coalesce(restante, 0) + (a->>'valor')::numeric, 2)
       where id = (a->>'credito_id')::uuid;
    end loop;
    update cashback_mov set estornado_em = now() where id = r.id;
  end loop;
end;
$$;

grant execute on function public.cashback_saldo(uuid) to authenticated, service_role;
grant execute on function public.cashback_resgatar(uuid, uuid, numeric) to authenticated, service_role;
grant execute on function public.cashback_estornar_resgate(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ gatilho
-- Toda mudança de status passa por aqui (painel, app do entregador, Pix):
-- entregue → credita; cancelado → devolve o usado e desfaz o ganho;
-- saiu de "entregue" pra outro status → desfaz o ganho (pode creditar de novo
-- quando voltar a entregue, se ninguém tiver gastado).
create or replace function public.delivery_pedido_cashback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c        cashback_config%rowtype;
  v_canal  text;
  v_forma  text;
  v_valor  numeric;
begin
  if new.status is not distinct from old.status then return new; end if;

  -- Saiu de "entregue": desfaz o crédito (o que ainda não foi gasto).
  if old.status = 'entregue' and new.status <> 'entregue' then
    delete from cashback_mov
     where pedido_id = new.id and tipo = 'credito' and restante = valor and estornado_em is null;
    update cashback_mov set restante = 0, estornado_em = now()
     where pedido_id = new.id and tipo = 'credito' and estornado_em is null;
    new.cashback_ganho := null;
  end if;

  if new.status = 'cancelado' then
    perform cashback_estornar_resgate(new.id);
    return new;
  end if;

  if new.status = 'entregue' and old.status <> 'entregue' then
    if new.cliente_id is null or coalesce(new.cashback_base, 0) <= 0 then return new; end if;
    select * into c from cashback_config where empresa_id = new.empresa_id;
    if not found or not c.ativo or c.percentual <= 0 then return new; end if;
    v_canal := case when new.origem = 'app' then 'app' else 'delivery' end;
    if not (v_canal = any (c.canais)) then return new; end if;
    v_forma := lower(btrim(coalesce(nullif(new.recebido_forma, ''), new.forma_pagamento, '')));
    if exists (select 1 from unnest(c.formas_excluidas) f where lower(btrim(f)) = v_forma) then return new; end if;
    v_valor := round(new.cashback_base * c.percentual / 100, 2);
    if v_valor < 0.01 then return new; end if;
    insert into cashback_mov (empresa_id, cliente_id, tipo, valor, restante, expira_em, pedido_id)
    values (new.empresa_id, new.cliente_id, 'credito', v_valor, v_valor, now() + make_interval(days => c.validade_dias), new.id)
    on conflict do nothing;
    new.cashback_ganho := v_valor;
  end if;
  return new;
end;
$$;

drop trigger if exists delivery_pedidos_cashback on public.delivery_pedidos;
create trigger delivery_pedidos_cashback
  before update of status on public.delivery_pedidos
  for each row execute function public.delivery_pedido_cashback();

-- Configuração inicial da Brasa = a do Manda Pedido (DESLIGADA: liga na tela).
insert into public.cashback_config (empresa_id, ativo, percentual, max_resgate, validade_dias, canais, sem_combos, sem_promos)
select id, false, 2, 20, 30, '{app,delivery}', true, true from public.empresas
on conflict (empresa_id) do nothing;
