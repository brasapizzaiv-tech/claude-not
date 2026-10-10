-- PEDIDO DE DELIVERY AUTOMÁTICO DA KERN
--
-- Os funcionários da Kern pedem marmita no app do convênio até 08:30. Às 08:35
-- (rotina /api/kern/delivery, de segunda a sábado) o sistema cria UM pedido de
-- delivery por filial, com a quantidade de marmitas pedidas, agendado pro
-- horário de entrega do convênio (11:00), no cliente da filial e com a forma
-- "Saldo cliente": ao receber, vira conta a receber da Kern.
--
-- kern_delivery_config: liga/desliga, o item cobrado e qual cliente é cada filial.
-- kern_delivery: o que já foi gerado (um por dia e filial), pra não duplicar e
-- pra poder atualizar a quantidade se entrar pedido depois.
create table if not exists public.kern_delivery_config (
  empresa_id uuid primary key default public.empresa_atual() references public.empresas (id),
  ativo      boolean not null default false,
  item_id    uuid references public.pdv_itens (id) on delete set null,
  clientes   jsonb not null default '{}',   -- {"Matriz": "<cliente_id>", ...}
  atualizado_em timestamptz not null default now()
);

create table if not exists public.kern_delivery (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null default public.empresa_atual() references public.empresas (id),
  data        date not null,
  filial      text not null,
  pedido_id   uuid references public.delivery_pedidos (id) on delete set null,
  qtd         integer not null,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz,
  unique (empresa_id, data, filial)
);

alter table public.kern_delivery_config enable row level security;
alter table public.kern_delivery enable row level security;
do $$
declare t text;
begin
  foreach t in array array['kern_delivery_config', 'kern_delivery'] loop
    execute format('drop policy if exists %I on public.%I', t || '_empresa', t);
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual())', t || '_empresa', t);
  end loop;
end $$;
grant select, insert, update, delete on public.kern_delivery_config, public.kern_delivery to authenticated, service_role;

-- Origem nova do pedido: "convenio" (aparece no quadro como Convênio).
alter table public.delivery_pedidos drop constraint if exists delivery_pedidos_origem_check;
alter table public.delivery_pedidos add constraint delivery_pedidos_origem_check
  check (origem in ('app', 'whatsapp', 'instagram', 'telefone', 'balcao', 'convenio'));

-- Configuração inicial: item "Marmita kern" e os clientes que já existem por
-- filial (palpite pelo nome; o Rafael confere em Delivery > Kern). Já ligado:
-- o pedido do Rafael foi "a partir de segunda".
insert into public.kern_delivery_config (empresa_id, ativo, item_id, clientes)
select e.id, true,
  (select id from public.pdv_itens where nome ilike 'marmita kern' and ativo limit 1),
  jsonb_strip_nulls(jsonb_build_object(
    'Matriz', (select id from public.clientes where nome ilike 'supermercados kern ltda matriz' limit 1),
    'Centro', (select id from public.clientes where nome ilike 'supermercados kern ltda filial' limit 1),
    'ADM',    (select id from public.clientes where nome ilike 'supermercados kern ltda adm' limit 1),
    'CD',     (select id from public.clientes where nome ilike 'supermercados kern ltda di' limit 1)
  ))
from public.empresas e
where e.id = '00000000-0000-4000-8000-000000000001'
on conflict (empresa_id) do nothing;
