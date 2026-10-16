-- VITRINE DO APP DE DELIVERY (pedido do Rafael, 15/10/2026 — protótipo em
-- docs/referencia-layout): o painel /delivery/vitrine decide o que o cliente
-- vê no /pedir:
--   • destaques do topo (banner com "Pedir agora"), ativos ou agendados;
--   • sugestões "Quer adicionar?" (depois de escolher um produto de tal
--     categoria) e "Pra fechar com chave de ouro" (no carrinho);
--   • gatilhos de cupom: boas-vindas (primeira visita), parado sem escolher
--     (com prazo) e carrinho abandonado (no app e no WhatsApp).
-- Todo cupom que aparece sai do cadastro de cupons (tabela cupons): a tela
-- nunca inventa desconto.

create table if not exists public.vitrine_destaques (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas(id),
  titulo     text not null,
  subtitulo  text,
  item_id    uuid references public.pdv_itens(id) on delete set null,
  preco_de   numeric(10,2),
  preco_por  numeric(10,2),
  foto_url   text,
  selo       text,                       -- "Só hoje", "Novo"…
  inicio     timestamptz,                -- null = já vale
  fim        timestamptz,                -- null = sem fim
  ativo      boolean not null default true,
  ordem      int not null default 0,
  criado_em  timestamptz not null default now()
);

create table if not exists public.vitrine_sugestoes (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas(id),
  momento    text not null check (momento in ('produto', 'carrinho')),
  -- 'produto': vale quando o cliente escolhe algo desta categoria ('__pizzas__'
  -- = pizza montada). 'carrinho': null.
  categoria  text,
  item_id    uuid not null references public.pdv_itens(id) on delete cascade,
  ordem      int not null default 0,
  criado_em  timestamptz not null default now()
);
create index if not exists vitrine_sugestoes_emp_idx on public.vitrine_sugestoes (empresa_id, momento);

create table if not exists public.vitrine_gatilhos (
  empresa_id   uuid not null default public.empresa_atual() references public.empresas(id),
  chave        text not null check (chave in ('boas_vindas', 'parado', 'abandonado')),
  ativo        boolean not null default false,
  cupom        text,          -- código na tabela cupons
  minutos      int,           -- parado: sem nada no carrinho há N min; abandonado: N min depois
  validade_min int,           -- parado: o cupom vale N min na tela
  primary key (empresa_id, chave)
);

-- Contagem da vitrine (últimos dias): quem abriu o app, chegou ao carrinho,
-- viu um cupom. Uma linha por sessão, tipo e dia (índice único).
create table if not exists public.vitrine_eventos (
  id         bigserial primary key,
  empresa_id uuid not null references public.empresas(id),
  sessao     text not null,
  tipo       text not null check (tipo in ('abriu', 'carrinho', 'cupom_mostrado')),
  dia        date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  detalhe    text,
  criado_em  timestamptz not null default now()
);
create unique index if not exists vitrine_eventos_unico on public.vitrine_eventos (empresa_id, sessao, tipo, dia);
create index if not exists vitrine_eventos_dia_idx on public.vitrine_eventos (empresa_id, dia);

-- Carrinho que o cliente montou com telefone e não fechou: base do gatilho de
-- WhatsApp "carrinho abandonado". Um por telefone (o último).
create table if not exists public.vitrine_carrinhos (
  empresa_id   uuid not null references public.empresas(id),
  telefone     text not null,
  cliente_id   uuid references public.clientes(id) on delete set null,
  resumo       text,
  total        numeric(10,2),
  atualizado_em timestamptz not null default now(),
  fechado_em   timestamptz,               -- virou pedido
  primary key (empresa_id, telefone)
);

alter table public.vitrine_destaques enable row level security;
alter table public.vitrine_sugestoes enable row level security;
alter table public.vitrine_gatilhos enable row level security;
alter table public.vitrine_eventos enable row level security;
alter table public.vitrine_carrinhos enable row level security;
do $$
declare t text;
begin
  foreach t in array array['vitrine_destaques', 'vitrine_sugestoes', 'vitrine_gatilhos', 'vitrine_eventos', 'vitrine_carrinhos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_empresa', t);
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual())', t || '_empresa', t);
  end loop;
end $$;
grant select, insert, update, delete on public.vitrine_destaques, public.vitrine_sugestoes, public.vitrine_gatilhos, public.vitrine_eventos, public.vitrine_carrinhos to authenticated, service_role;
grant usage, select on sequence public.vitrine_eventos_id_seq to authenticated, service_role;

-- Os três gatilhos nascem desligados, com os prazos do protótipo.
insert into public.vitrine_gatilhos (empresa_id, chave, ativo, minutos, validade_min)
select e.id, g.chave, false, g.minutos, g.validade
  from public.empresas e
  cross join (values ('boas_vindas', null::int, null::int), ('parado', 2, 15), ('abandonado', 20, null)) as g(chave, minutos, validade)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- WhatsApp: gatilho novo "carrinho_abandonado" no motor de disparos. Só vai
-- pra cliente cadastrado, que aceitou promoções (é marketing), N minutos
-- depois de largar o carrinho e sem pedido feito depois. Mesma função de
-- 0215, com um bloco a mais.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wpp_candidatos(p_empresa uuid, p_chave text, p_dias integer, p_intervalo integer)
 RETURNS TABLE(cliente_id uuid, nome text, telefone text, ref text, extra jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_marketing boolean := p_chave in ('inativo', 'em_risco', 'nunca_comprou', 'aniversario', 'carrinho_abandonado');
  v_dias integer := coalesce(p_dias, 0);
begin
  perform public.exigir_logado();
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
    union all
    -- carrinho abandonado: montou o carrinho com telefone, largou há N minutos
    -- (N = os minutos da vitrine; até 6 h depois) e não fez pedido depois.
    select vc.cliente_id, 'carr:' || vc.cliente_id || ':' || to_char(vc.atualizado_em, 'YYYYMMDDHH24MI'),
           jsonb_build_object('total', vc.total, 'resumo', vc.resumo)
      from vitrine_carrinhos vc
      join vitrine_gatilhos vg on vg.empresa_id = vc.empresa_id and vg.chave = 'abandonado'
     where p_chave = 'carrinho_abandonado'
       and vc.empresa_id = p_empresa and vc.cliente_id is not null and vc.fechado_em is null
       and vc.atualizado_em < now() - make_interval(mins => greatest(coalesce(vg.minutos, 20), 5))
       and vc.atualizado_em > now() - interval '6 hours'
       and not exists (
         select 1 from delivery_pedidos d
          where d.empresa_id = p_empresa and d.cliente_id = vc.cliente_id and d.criado_em > vc.atualizado_em - interval '5 minutes'
       )
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
$function$;
