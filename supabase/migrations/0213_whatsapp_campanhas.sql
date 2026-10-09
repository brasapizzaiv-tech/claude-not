-- Campanhas e gatilhos automáticos pelo WhatsApp OFICIAL (Meta), pedido do
-- Rafael em 09/10/2026 com as telas do Manda Pedido de exemplo. Decisões dele:
--   * só pela API oficial (paga por mensagem, sem risco de bloquear o número);
--   * pode mandar pra base inteira de clientes (inclusive a importada), menos
--     quem pediu pra sair;
--   * caixa "Quero receber promoções" no cardápio e no cadastro;
--   * aniversário opcional: o cliente decide se quer promoção no dia dele.
--
-- Toda mensagem é um MODELO aprovado pela Meta (texto livre não sai fora da
-- janela de 24 h). As variáveis {{1}}, {{2}}... de cada modelo são ligadas a
-- dados (nome, link, cupom, cashback...) na campanha ou no gatilho.

-- ---------------------------------------------------------------- cliente
alter table public.clientes
  add column if not exists aceita_promocoes    boolean,      -- null = nunca perguntado (base importada); false = não quer
  add column if not exists aceita_promocoes_em timestamptz,
  add column if not exists nascimento          date,
  add column if not exists aceita_aniversario  boolean not null default false,
  add column if not exists wpp_sair_em         timestamptz;  -- respondeu SAIR: não recebe mais nada de marketing

-- ---------------------------------------------------------------- tabelas
create table if not exists public.wpp_config (
  empresa_id          uuid primary key default public.empresa_atual() references public.empresas (id),
  limite_dia          integer not null default 250 check (limite_dia > 0),  -- teto da Meta pro número (começa em 250/1000)
  intervalo_auto_dias integer not null default 7 check (intervalo_auto_dias >= 0), -- trava: 1 automática por cliente a cada N dias
  auto_hora_ini       text not null default '10:00',
  auto_hora_fim       text not null default '20:00',
  preco_marketing     numeric,  -- R$ por mensagem (só pra estimar o custo na tela)
  preco_utilidade     numeric,
  atualizado_em       timestamptz not null default now()
);

create table if not exists public.wpp_campanhas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null default public.empresa_atual() references public.empresas (id),
  nome          text not null,
  publico       jsonb not null default '{"tipo":"todos"}',  -- {tipo, dias, min}
  dias          integer[] not null default '{0,1,2,3,4,5,6}', -- 0 = domingo
  hora_ini      text not null default '10:00',
  hora_fim      text not null default '20:00',
  cupom         text,
  modelo        text not null,
  idioma        text not null default 'pt_BR',
  variaveis     text[] not null default '{}',   -- o que vai em {{1}}, {{2}}...
  imagem_url    text,                            -- se o modelo tem imagem no topo
  status        text not null default 'rascunho'
                check (status in ('rascunho', 'agendada', 'enviando', 'pausada', 'concluida', 'cancelada')),
  total_clientes integer,
  montada_em    timestamptz,
  lancada_em    timestamptz,
  concluida_em  timestamptz,
  criado_por    uuid,
  criado_em     timestamptz not null default now()
);

create table if not exists public.wpp_envios (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null default public.empresa_atual() references public.empresas (id),
  campanha_id  uuid references public.wpp_campanhas (id) on delete cascade,
  gatilho      text,
  ref          text,           -- gatilho: o evento (pedido, crédito, aniversário do ano...) — não manda 2x o mesmo
  cliente_id   uuid references public.clientes (id) on delete set null,
  telefone     text not null,
  nome         text,
  modelo       text,
  params       text[],
  status       text not null default 'fila'
               check (status in ('fila', 'enviada', 'entregue', 'lida', 'falha', 'pulada')),
  wa_id        text,
  erro         text,
  enviado_em   timestamptz,
  entregue_em  timestamptz,
  lido_em      timestamptz,
  criado_em    timestamptz not null default now()
);
create unique index if not exists wpp_envios_campanha_cliente_uq on public.wpp_envios (campanha_id, cliente_id) where campanha_id is not null;
create unique index if not exists wpp_envios_gatilho_ref_uq on public.wpp_envios (gatilho, ref) where gatilho is not null;
create index if not exists wpp_envios_wa_idx on public.wpp_envios (wa_id);
create index if not exists wpp_envios_fila_idx on public.wpp_envios (campanha_id, status);
create index if not exists wpp_envios_dia_idx on public.wpp_envios (empresa_id, enviado_em);
create index if not exists wpp_envios_cliente_idx on public.wpp_envios (cliente_id, enviado_em desc);

create table if not exists public.wpp_gatilhos (
  empresa_id    uuid not null default public.empresa_atual() references public.empresas (id),
  chave         text not null,
  ativo         boolean not null default false,
  modelo        text,
  idioma        text not null default 'pt_BR',
  variaveis     text[] not null default '{}',
  dias          integer,
  cupom         text,
  imagem_url    text,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, chave)
);

alter table public.delivery_pedidos
  add column if not exists campanha_id uuid references public.wpp_campanhas (id) on delete set null;

-- ---------------------------------------------------------------- RLS
alter table public.wpp_config enable row level security;
alter table public.wpp_campanhas enable row level security;
alter table public.wpp_envios enable row level security;
alter table public.wpp_gatilhos enable row level security;
do $$
declare t text;
begin
  foreach t in array array['wpp_config', 'wpp_campanhas', 'wpp_envios', 'wpp_gatilhos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_empresa', t);
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual())', t || '_empresa', t);
  end loop;
end $$;
grant select, insert, update, delete on public.wpp_config, public.wpp_campanhas, public.wpp_envios, public.wpp_gatilhos to authenticated, service_role;

-- ---------------------------------------------------------------- compras por cliente
-- Delivery entregue + venda de balcão/caixa com cliente vinculado (sem contar
-- duas vezes a comanda que já é de um pedido de delivery).
create or replace function public.cliente_compras(p_empresa uuid)
returns table (cliente_id uuid, n integer, primeira timestamptz, ultima timestamptz, intervalo_medio numeric)
language sql
stable
security definer
set search_path = public
as $$
  with compras as (
    select d.cliente_id, coalesce(d.entregue_em, d.criado_em) as em
      from delivery_pedidos d
     where d.empresa_id = p_empresa and d.status = 'entregue' and d.cliente_id is not null
    union all
    select c.cliente_id, coalesce(c.fechada_em, c.aberta_em)
      from pdv_comandas c
     where c.empresa_id = p_empresa and c.cliente_id is not null and c.status = 'fechada'
       and not exists (select 1 from delivery_pedidos d2 where d2.comanda_id = c.id)
  )
  select cliente_id, count(*)::int, min(em), max(em),
         case when count(*) > 1
              then round((extract(epoch from (max(em) - min(em))) / 86400.0 / (count(*) - 1))::numeric, 1) end
    from compras
   group by cliente_id;
$$;

-- ---------------------------------------------------------------- público da campanha
create or replace function public.wpp_publico(p_empresa uuid, p_tipo text, p_dias integer default null, p_min integer default null)
returns table (cliente_id uuid, nome text, telefone text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (regexp_replace(cl.telefone, '\D', '', 'g')) cl.id, cl.nome, cl.telefone
    from clientes cl
    left join cliente_compras(p_empresa) cc on cc.cliente_id = cl.id
   where cl.empresa_id = p_empresa
     and cl.ativo
     and cl.wpp_sair_em is null
     and coalesce(cl.aceita_promocoes, true)
     and length(regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g')) between 10 and 13
     and case p_tipo
           when 'todos'      then true
           when 'nunca'      then cc.cliente_id is null
           when 'recentes'   then cc.ultima >= now() - make_interval(days => coalesce(p_dias, 30))
           when 'inativos'   then cc.ultima <  now() - make_interval(days => coalesce(p_dias, 30))
           when 'frequentes' then cc.n >= coalesce(p_min, 3)
           when 'cashback'   then cashback_saldo(cl.id) > 0
           else false
         end
   order by regexp_replace(cl.telefone, '\D', '', 'g'), cc.ultima desc nulls last;
$$;

-- ---------------------------------------------------------------- candidatos de cada gatilho
-- ref = o evento: o mesmo (gatilho, ref) nunca sai duas vezes (índice único).
-- extra = dados pras variáveis (valor do cashback, vencimento, cupom...).
-- A trava "1 automática a cada N dias" é aplicada aqui (p_intervalo).
create or replace function public.wpp_candidatos(p_empresa uuid, p_chave text, p_dias integer, p_intervalo integer)
returns table (cliente_id uuid, nome text, telefone text, ref text, extra jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_marketing boolean := p_chave in ('inativo', 'em_risco', 'nunca_comprou', 'aniversario');
  v_dias integer := coalesce(p_dias, 0);
begin
  return query
  with base as (
    -- comprou / primeira compra / cupom / campanha: pedidos entregues nas últimas 24 h
    select d.cliente_id as cid, 'ped:' || d.id as r,
           jsonb_build_object('cupom', substring(coalesce(d.desconto_motivo, '') from 'Cupom ([A-Z0-9]+)')) as ex
      from delivery_pedidos d
      left join cliente_compras(p_empresa) cc on cc.cliente_id = d.cliente_id
     where p_chave in ('comprou', 'primeira_compra', 'cupom', 'campanha')
       and d.empresa_id = p_empresa and d.status = 'entregue' and d.cliente_id is not null
       and d.entregue_em > now() - interval '24 hours'
       and (p_chave <> 'primeira_compra' or cc.n = 1)
       and (p_chave <> 'cupom' or d.desconto_motivo ilike '%Cupom %')
       and (p_chave <> 'campanha' or d.campanha_id is not null)
    union all
    -- balcão com cliente vinculado (comprou / primeira compra)
    select c.cliente_id, 'cmd:' || c.id, '{}'::jsonb
      from pdv_comandas c
      left join cliente_compras(p_empresa) cc on cc.cliente_id = c.cliente_id
     where p_chave in ('comprou', 'primeira_compra')
       and c.empresa_id = p_empresa and c.status = 'fechada' and c.cliente_id is not null
       and c.fechada_em > now() - interval '24 hours'
       and not exists (select 1 from delivery_pedidos d2 where d2.comanda_id = c.id)
       and (p_chave <> 'primeira_compra' or cc.n = 1)
    union all
    -- ganhou cashback (últimas 24 h)
    select m.cliente_id, 'cb:' || m.id,
           jsonb_build_object('valor', m.valor, 'vence', m.expira_em)
      from cashback_mov m
     where p_chave = 'cashback_ganho'
       and m.empresa_id = p_empresa and m.tipo = 'credito' and m.estornado_em is null
       and m.criado_em > now() - interval '24 hours'
    union all
    -- cashback vencendo nos próximos N dias
    select m.cliente_id, 'cbx:' || m.id,
           jsonb_build_object('valor', m.restante, 'vence', m.expira_em)
      from cashback_mov m
     where p_chave = 'cashback_expira'
       and m.empresa_id = p_empresa and m.tipo = 'credito' and m.estornado_em is null
       and m.restante > 0 and m.expira_em > now()
       and m.expira_em <= now() + make_interval(days => greatest(v_dias, 1))
    union all
    -- inativo: última compra passou de N dias (até N+30, pra não acordar quem sumiu há anos)
    select cc.cliente_id, 'inat:' || cc.cliente_id || ':' || cc.ultima::date,
           jsonb_build_object('dias_sem', floor(extract(epoch from now() - cc.ultima) / 86400))
      from cliente_compras(p_empresa) cc
     where p_chave = 'inativo'
       and cc.ultima < now() - make_interval(days => greatest(v_dias, 1))
       and cc.ultima > now() - make_interval(days => greatest(v_dias, 1) + 30)
    union all
    -- em risco: já comprou 3+ vezes e está passando 1,5× do intervalo normal dele
    select cc.cliente_id, 'risco:' || cc.cliente_id || ':' || cc.ultima::date,
           jsonb_build_object('dias_sem', floor(extract(epoch from now() - cc.ultima) / 86400))
      from cliente_compras(p_empresa) cc
     where p_chave = 'em_risco'
       and cc.n >= 3 and cc.intervalo_medio is not null and cc.intervalo_medio > 0
       and now() - cc.ultima > make_interval(secs => (cc.intervalo_medio * 1.5 * 86400)::double precision)
       and now() - cc.ultima < interval '60 days'
    union all
    -- nunca comprou: cadastrou há N dias (até N+30 — a base antiga vai por campanha)
    select cl.id, 'nunca:' || cl.id, '{}'::jsonb
      from clientes cl
     where p_chave = 'nunca_comprou'
       and cl.empresa_id = p_empresa
       and cl.criado_em < now() - make_interval(days => greatest(v_dias, 1))
       and cl.criado_em > now() - make_interval(days => greatest(v_dias, 1) + 30)
       and not exists (select 1 from cliente_compras(p_empresa) cc where cc.cliente_id = cl.id)
    union all
    -- aniversário: no dia (N = 0) ou N dias antes; só quem quis
    select cl.id, 'aniv:' || cl.id || ':' || extract(year from (now() at time zone 'America/Sao_Paulo') + make_interval(days => v_dias))::int,
           jsonb_build_object('aniversario', cl.nascimento)
      from clientes cl
     where p_chave = 'aniversario'
       and cl.empresa_id = p_empresa and cl.aceita_aniversario and cl.nascimento is not null
       and to_char(cl.nascimento, 'MM-DD') = to_char((now() at time zone 'America/Sao_Paulo') + make_interval(days => v_dias), 'MM-DD')
  )
  select distinct on (b.r) cl.id, cl.nome, cl.telefone, b.r, b.ex
    from base b
    join clientes cl on cl.id = b.cid
   where cl.ativo
     and cl.wpp_sair_em is null
     and (not v_marketing or coalesce(cl.aceita_promocoes, true))
     and length(regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g')) between 10 and 13
     and not exists (select 1 from wpp_envios e where e.gatilho = p_chave and e.ref = b.r)
     and not exists (
       select 1 from wpp_envios e
        where e.cliente_id = cl.id and e.gatilho is not null and e.status <> 'pulada' and e.status <> 'falha'
          and e.enviado_em > now() - make_interval(days => greatest(coalesce(p_intervalo, 0), 0))
     );
end;
$$;

grant execute on function public.cliente_compras(uuid) to authenticated, service_role;
grant execute on function public.wpp_publico(uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.wpp_candidatos(uuid, text, integer, integer) to authenticated, service_role;

insert into public.wpp_config (empresa_id) select id from public.empresas on conflict (empresa_id) do nothing;
