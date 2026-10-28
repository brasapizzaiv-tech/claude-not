-- CAIXA DO MOTOBOY (Rafael, 28/10/2026). O boy sai com um troco (R$ 63:
-- 1×20, 2×10, 2×5, 5×2 e R$ 3 em moeda), cobra as teles na porta (dinheiro
-- ou maquininha) e no fim do turno devolve o dinheiro e as maquininhas. O
-- "Entreguei" do app não marca mais pago: o pedido fica "com o motoboy" até o
-- caixa conferir dinheiro + comprovantes e fechar o caixa dele; aí cada pedido
-- entra no caixa aberto pela forma conferida. Pix online já sai pago e não
-- entra na conta. O troco volta pra bolsa do boy, não é venda.
alter table public.entregadores
  add column if not exists troco_inicial numeric(10,2) not null default 63;

create table if not exists public.entregador_fechamentos (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null default public.empresa_atual() references public.empresas (id),
  entregador_id      uuid not null references public.entregadores (id) on delete cascade,
  caixa_id           uuid references public.pdv_caixas (id) on delete set null,
  troco              numeric(10,2) not null default 0,
  esperado_dinheiro  numeric(10,2) not null default 0,  -- troco + pedidos em dinheiro
  contado_dinheiro   numeric(10,2) not null default 0,
  esperado_maquina   numeric(10,2) not null default 0,  -- cartão + pix na máquina
  conferido_maquina  numeric(10,2) not null default 0,  -- soma dos comprovantes
  pedidos            uuid[] not null default '{}',
  obs                text,
  fechado_por        text,
  criado_em          timestamptz not null default now()
);
create index if not exists entregador_fechamentos_empresa_idx on public.entregador_fechamentos (empresa_id, criado_em desc);

alter table public.entregador_fechamentos enable row level security;
drop policy if exists entregador_fechamentos_empresa on public.entregador_fechamentos;
create policy entregador_fechamentos_empresa on public.entregador_fechamentos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());
