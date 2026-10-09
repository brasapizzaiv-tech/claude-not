-- Funções "security definer" (rodam com permissão total) não podem ser
-- chamadas por quem não fez login.
--
-- O scripts/migrate.mjs dá "execute em todas as funções" pro papel anon a cada
-- rodada, e a chave anon é pública (vai no navegador). Sem esta trava, qualquer
-- pessoa podia chamar wpp_publico() e baixar nome e telefone dos clientes, ou
-- gastar o cashback de alguém. Por isso a trava fica DENTRO da função: nenhum
-- grant futuro desfaz.
--
-- Dentro de gatilho (trigger) não trava: quem disparou já passou pelo RLS.

create or replace function public.exigir_logado()
returns void
language plpgsql
stable
as $$
declare
  v_papel text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), ''),
    '');
begin
  if pg_trigger_depth() = 0 and v_papel = 'anon' then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
end;
$$;

-- Só o servidor (chave de serviço) ou conexão direta ao banco.
create or replace function public.exigir_servidor()
returns void
language plpgsql
stable
as $$
declare
  v_papel text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), ''),
    '');
begin
  if pg_trigger_depth() = 0 and v_papel in ('anon', 'authenticated') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
end;
$$;

-- cashback_creditar_venda (plpgsql)
CREATE OR REPLACE FUNCTION public.cashback_creditar_venda(p_cliente uuid, p_comanda uuid, p_base numeric, p_forma text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c       cashback_config%rowtype;
  v_emp   uuid;
  v_valor numeric;
begin
  perform public.exigir_logado();
  if p_cliente is null or coalesce(p_base, 0) <= 0 then return 0; end if;
  select empresa_id into v_emp from clientes where id = p_cliente;
  select * into c from cashback_config where empresa_id = v_emp;
  if not found or not c.ativo or c.percentual <= 0 or not ('pdv' = any (c.canais)) then return 0; end if;
  if exists (select 1 from unnest(c.formas_excluidas) f where lower(btrim(f)) = lower(btrim(coalesce(p_forma, '')))) then return 0; end if;
  v_valor := round(p_base * c.percentual / 100, 2);
  if v_valor < 0.01 then return 0; end if;
  insert into cashback_mov (empresa_id, cliente_id, tipo, valor, restante, expira_em, comanda_id)
  values (v_emp, p_cliente, 'credito', v_valor, v_valor, now() + make_interval(days => c.validade_dias), p_comanda)
  on conflict do nothing;
  return v_valor;
end;
$function$;

-- cashback_estornar_resgate (plpgsql)
CREATE OR REPLACE FUNCTION public.cashback_estornar_resgate(p_pedido uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  a jsonb;
begin
  perform public.exigir_logado();
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
$function$;

-- cashback_estornar_resgate_comanda (plpgsql)
CREATE OR REPLACE FUNCTION public.cashback_estornar_resgate_comanda(p_comanda uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  a jsonb;
begin
  perform public.exigir_logado();
  for r in select id, alocacao from cashback_mov
            where comanda_id = p_comanda and tipo = 'resgate' and estornado_em is null
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
$function$;

-- cashback_resgatar (sql)
CREATE OR REPLACE FUNCTION public.cashback_resgatar(p_cliente uuid, p_pedido uuid, p_valor numeric)
 RETURNS numeric
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.exigir_logado(); select public.cashback_resgatar_ref(p_cliente, p_pedido, null, p_valor); $function$;

-- cashback_resgatar_ref (plpgsql)
CREATE OR REPLACE FUNCTION public.cashback_resgatar_ref(p_cliente uuid, p_pedido uuid, p_comanda uuid, p_valor numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_falta numeric := round(coalesce(p_valor, 0), 2);
  v_usado numeric := 0;
  v_aloc  jsonb := '[]'::jsonb;
  v_emp   uuid;
  r       record;
  v_tira  numeric;
begin
  perform public.exigir_logado();
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
    insert into cashback_mov (empresa_id, cliente_id, tipo, valor, pedido_id, comanda_id, alocacao)
    values (v_emp, p_cliente, 'resgate', v_usado, p_pedido, p_comanda, v_aloc);
  end if;
  return v_usado;
end;
$function$;

-- cashback_saldo (sql)
CREATE OR REPLACE FUNCTION public.cashback_saldo(p_cliente uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.exigir_logado();
  select coalesce(round(sum(restante), 2), 0)
    from cashback_mov
   where cliente_id = p_cliente
     and tipo = 'credito'
     and estornado_em is null
     and restante > 0
     and expira_em > now();
$function$;

-- cliente_compras (sql)
CREATE OR REPLACE FUNCTION public.cliente_compras(p_empresa uuid)
 RETURNS TABLE(cliente_id uuid, n integer, primeira timestamp with time zone, ultima timestamp with time zone, intervalo_medio numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.exigir_logado();
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
$function$;

-- wpp_candidatos (plpgsql)
CREATE OR REPLACE FUNCTION public.wpp_candidatos(p_empresa uuid, p_chave text, p_dias integer, p_intervalo integer)
 RETURNS TABLE(cliente_id uuid, nome text, telefone text, ref text, extra jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_marketing boolean := p_chave in ('inativo', 'em_risco', 'nunca_comprou', 'aniversario');
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

-- wpp_marcar_sair (plpgsql)
CREATE OR REPLACE FUNCTION public.wpp_marcar_sair(p_fone text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fim text := right(regexp_replace(coalesce(p_fone, ''), '\D', '', 'g'), 8);
  v_n integer;
begin
  perform public.exigir_servidor();
  if length(v_fim) < 8 then return 0; end if;
  update clientes
     set wpp_sair_em = now(), aceita_promocoes = false, aceita_promocoes_em = now()
   where right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = v_fim
     and wpp_sair_em is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- wpp_publico (sql)
CREATE OR REPLACE FUNCTION public.wpp_publico(p_empresa uuid, p_tipo text, p_dias integer DEFAULT NULL::integer, p_min integer DEFAULT NULL::integer)
 RETURNS TABLE(cliente_id uuid, nome text, telefone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.exigir_logado();
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
$function$;

