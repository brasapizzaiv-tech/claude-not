-- SEC-09 (Onda 5, antes de ligar o cashback): as funções do cashback aceitavam
-- qualquer login e valor livre. Quem tivesse login chamava
-- cashback_creditar_venda(cliente, comanda, 99999) pela API e dava crédito sem
-- limite; resgatava ou devolvia o saldo de qualquer cliente; e a tabela
-- cashback_mov aceitava gravação direta de quem tinha Delivery/PDV.
--
-- Agora:
--   * só o servidor (chave administrativa), um gatilho ou quem tem Delivery/PDV
--     chama — e pela sessão só cliente/comanda/pedido da própria empresa;
--   * o crédito do balcão é CALCULADO AQUI pelos itens da comanda no banco
--     (fechada, do mesmo cliente); o valor que vem da tela é ignorado;
--   * usar saldo só num pedido/comanda daquele cliente, ainda em aberto, até o
--     limite por pedido da configuração;
--   * devolver o usado: no balcão só com a comanda ainda aberta (venda que não
--     fechou); no delivery só pelo gatilho do cancelamento (ou o servidor);
--   * o crédito do delivery na entrega fica limitado ao que o pedido vale
--     (itens − desconto), mesmo que alguém mexa no cashback_base;
--   * cashback_mov pela sessão é só leitura.
-- A trava fica DENTRO das funções: o migrate.mjs devolve execute ao
-- authenticated depois de cada migration.

-- ------------------------------------------------------------------ trava
-- Devolve a empresa que a sessão pode tocar (null = servidor/gatilho/interno).
create or replace function public._cashback_quem()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel text := coalesce(auth.role(), '');
begin
  if pg_trigger_depth() > 0 or v_papel not in ('anon', 'authenticated') then
    return null;
  end if;
  if v_papel = 'anon' then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if not (public.tem_permissao('delivery') or public.tem_permissao('pdv')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return coalesce(public.empresa_atual(), '00000000-0000-0000-0000-000000000000'::uuid);
end;
$$;
revoke all on function public._cashback_quem() from public, anon;

-- ------------------------------------------------------------------ saldo
create or replace function public.cashback_saldo(p_cliente uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sessao uuid := public._cashback_quem();
  v_emp uuid;
begin
  select empresa_id into v_emp from clientes where id = p_cliente;
  if v_emp is null or (v_sessao is not null and v_emp <> v_sessao) then return 0; end if;
  return (select coalesce(round(sum(restante), 2), 0)
            from cashback_mov
           where cliente_id = p_cliente and empresa_id = v_emp
             and tipo = 'credito' and estornado_em is null
             and restante > 0 and expira_em > now());
end;
$$;

-- ------------------------------------------------------------------ usar
create or replace function public.cashback_resgatar_ref(p_cliente uuid, p_pedido uuid, p_comanda uuid, p_valor numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessao uuid := public._cashback_quem();
  v_falta numeric := round(coalesce(p_valor, 0), 2);
  v_usado numeric := 0;
  v_aloc  jsonb := '[]'::jsonb;
  v_emp   uuid;
  v_teto  numeric;
  v_cmd   uuid;
  v_vale  numeric;
  r       record;
  v_tira  numeric;
begin
  if v_falta <= 0 or p_cliente is null then return 0; end if;
  -- Exatamente um: o pedido do delivery OU a comanda do balcão.
  if (p_pedido is null) = (p_comanda is null) then return 0; end if;
  select empresa_id into v_emp from clientes where id = p_cliente;
  if v_emp is null or (v_sessao is not null and v_emp <> v_sessao) then return 0; end if;

  if p_pedido is not null then
    select comanda_id into v_cmd from delivery_pedidos
     where id = p_pedido and empresa_id = v_emp and cliente_id = p_cliente
       and status <> 'cancelado' and coalesce(pago, false) = false;
  else
    select id into v_cmd from pdv_comandas
     where id = p_comanda and empresa_id = v_emp and status = 'aberta';
  end if;
  if v_cmd is null then return 0; end if;

  -- Nunca mais do que a conta vale (itens lançados).
  select coalesce(sum(round(qtd * preco_unit, 2)), 0) into v_vale
    from pdv_comanda_itens where comanda_id = v_cmd;
  v_falta := least(v_falta, v_vale);
  select max_resgate into v_teto from cashback_config where empresa_id = v_emp;
  if v_teto is not null then v_falta := least(v_falta, round(v_teto, 2)); end if;
  if v_falta <= 0 then return 0; end if;

  for r in
    select id, restante
      from cashback_mov
     where cliente_id = p_cliente and empresa_id = v_emp and tipo = 'credito' and estornado_em is null
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
  end loop;
  if v_usado > 0 then
    -- O índice único (um resgate por pedido/comanda) recusa a segunda vez e
    -- desfaz o que foi tirado acima.
    insert into cashback_mov (empresa_id, cliente_id, tipo, valor, pedido_id, comanda_id, alocacao)
    values (v_emp, p_cliente, 'resgate', v_usado, p_pedido, p_comanda, v_aloc);
  end if;
  return v_usado;
end;
$$;

create or replace function public.cashback_resgatar(p_cliente uuid, p_pedido uuid, p_valor numeric)
returns numeric
language sql
security definer
set search_path = public
as $$ select public.cashback_resgatar_ref(p_cliente, p_pedido, null, p_valor); $$;

-- ------------------------------------------------------------------ devolver
-- Delivery: só o gatilho do cancelamento (ou o servidor).
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
  perform public.exigir_servidor();
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

-- Balcão: só a venda que NÃO fechou (comanda ainda aberta) devolve o usado.
create or replace function public.cashback_estornar_resgate_comanda(p_comanda uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessao uuid := public._cashback_quem();
  v_ok boolean;
  r record;
  a jsonb;
begin
  select true into v_ok from pdv_comandas
   where id = p_comanda and status = 'aberta'
     and (v_sessao is null or empresa_id = v_sessao);
  if not coalesce(v_ok, false) then return; end if;
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
$$;

-- ------------------------------------------------------------------ ganhar no balcão
-- p_base é IGNORADO (fica na assinatura pra não quebrar quem chama): a base é
-- calculada aqui pelos itens da comanda — sem os em promoção quando a
-- configuração manda — tirando a parte de desconto e cashback usado
-- (desconto_nota), e nunca passa do que entrou no caixa por ela. Só comanda
-- de BALCÃO (não do delivery, que ganha na entrega) FECHADA há no máximo
-- 15 min, do mesmo cliente e da mesma empresa; a forma é a gravada na
-- comanda; cortesia, vale-presente e compra da equipe não ganham; o índice
-- único deixa creditar uma vez só.
create or replace function public.cashback_creditar_venda(p_cliente uuid, p_comanda uuid, p_base numeric, p_forma text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessao uuid := public._cashback_quem();
  c        cashback_config%rowtype;
  v_cmd    pdv_comandas%rowtype;
  v_total  numeric;
  v_eleg   numeric;
  v_base   numeric;
  v_valor  numeric;
  v_id     uuid;
  v_forma  text;
  v_tipo   text;
  v_caixa  numeric;
begin
  if p_cliente is null or p_comanda is null then return 0; end if;
  select * into v_cmd from pdv_comandas where id = p_comanda;
  if not found or v_cmd.status <> 'fechada' or v_cmd.cliente_id is distinct from p_cliente then return 0; end if;
  if v_cmd.fechada_em is null or v_cmd.fechada_em < now() - interval '15 minutes' then return 0; end if;
  if v_sessao is not null and v_cmd.empresa_id <> v_sessao then return 0; end if;
  if not exists (select 1 from clientes where id = p_cliente and empresa_id = v_cmd.empresa_id) then return 0; end if;
  if exists (select 1 from delivery_pedidos where comanda_id = p_comanda) then return 0; end if;

  select * into c from cashback_config where empresa_id = v_cmd.empresa_id;
  if not found or not c.ativo or c.percentual <= 0 or not ('pdv' = any (c.canais)) then return 0; end if;
  v_forma := lower(btrim(coalesce(nullif(v_cmd.forma_pagamento, ''), p_forma, '')));
  if exists (select 1 from unnest(c.formas_excluidas) f where lower(btrim(f)) = v_forma) then return 0; end if;
  select lower(tipo) into v_tipo from formas_pagamento
   where empresa_id = v_cmd.empresa_id and lower(btrim(nome)) = v_forma limit 1;
  if coalesce(v_tipo, '') in ('cortesia', 'vale_presente', 'equipe')
     or v_forma like '%cortesia%' or v_forma like '%presente%'
     or v_forma like '%equipe%' or v_forma like '%funcion%' then
    return 0;
  end if;
  -- O que entrou no caixa por esta comanda limita a base.
  select coalesce(sum(valor), 0) into v_caixa
    from pdv_caixa_mov where comanda_id = p_comanda and tipo = 'venda';
  if v_caixa <= 0 then return 0; end if;

  select coalesce(sum(round(i.qtd * i.preco_unit, 2)), 0),
         coalesce(sum(round(i.qtd * i.preco_unit, 2)) filter (
           where not (c.sem_promos and coalesce(p.promo_preco, 0) > 0)), 0)
    into v_total, v_eleg
    from pdv_comanda_itens i
    left join pdv_itens p on p.id = i.item_id
   where i.comanda_id = p_comanda;
  if v_total <= 0 then return 0; end if;
  v_base := least(v_caixa, greatest(0, v_eleg * (1 - least(coalesce(v_cmd.desconto_nota, 0), v_total) / v_total)));
  v_valor := round(v_base * c.percentual / 100, 2);
  if v_valor < 0.01 then return 0; end if;

  insert into cashback_mov (empresa_id, cliente_id, tipo, valor, restante, expira_em, comanda_id)
  values (v_cmd.empresa_id, p_cliente, 'credito', v_valor, v_valor, now() + make_interval(days => c.validade_dias), p_comanda)
  on conflict do nothing
  returning id into v_id;
  return case when v_id is null then 0 else v_valor end;
end;
$$;

-- ------------------------------------------------------------------ ganhar na entrega
-- Igual ao de antes, com estes cuidados na hora de GANHAR:
--   * pela sessão, só quem tem Delivery entrega com cashback (a tabela de
--     pedidos aceita gravação de qualquer login da empresa);
--   * o cliente e a comanda têm que ser da empresa do pedido, e a comanda não
--     pode ser usada por outro pedido;
--   * a base fica limitada ao que o pedido vale (itens − desconto);
--   * pedido cujo cashback usado já foi devolvido (foi cancelado) não ganha
--     de novo se voltar pra "entregue" — senão o cliente ficava com o
--     desconto E com o saldo de volta.
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
  v_teto   numeric;
  v_base   numeric;
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
    if new.cliente_id is null or new.comanda_id is null or coalesce(new.cashback_base, 0) <= 0 then return new; end if;
    if coalesce(auth.role(), '') = 'authenticated' and not public.tem_permissao('delivery') then return new; end if;
    if coalesce(auth.role(), '') = 'anon' then return new; end if;
    if not exists (select 1 from clientes where id = new.cliente_id and empresa_id = new.empresa_id) then return new; end if;
    if not exists (select 1 from pdv_comandas where id = new.comanda_id and empresa_id = new.empresa_id) then return new; end if;
    if exists (select 1 from delivery_pedidos where comanda_id = new.comanda_id and id <> new.id) then return new; end if;
    if exists (select 1 from cashback_mov where pedido_id = new.id and tipo = 'resgate' and estornado_em is not null) then return new; end if;
    select * into c from cashback_config where empresa_id = new.empresa_id;
    if not found or not c.ativo or c.percentual <= 0 then return new; end if;
    v_canal := case when new.origem = 'app' then 'app' else 'delivery' end;
    if not (v_canal = any (c.canais)) then return new; end if;
    v_forma := lower(btrim(coalesce(nullif(new.recebido_forma, ''), new.forma_pagamento, '')));
    if exists (select 1 from unnest(c.formas_excluidas) f where lower(btrim(f)) = v_forma) then return new; end if;
    select coalesce(sum(round(qtd * preco_unit, 2)), 0) into v_teto
      from pdv_comanda_itens where comanda_id = new.comanda_id;
    v_base := least(new.cashback_base, greatest(0, v_teto - coalesce(new.desconto, 0)));
    v_valor := round(v_base * c.percentual / 100, 2);
    if v_valor < 0.01 then return new; end if;
    insert into cashback_mov (empresa_id, cliente_id, tipo, valor, restante, expira_em, pedido_id)
    values (new.empresa_id, new.cliente_id, 'credito', v_valor, v_valor, now() + make_interval(days => c.validade_dias), new.id)
    on conflict do nothing;
    new.cashback_ganho := v_valor;
  end if;
  return new;
end;
$$;

revoke all on function public.cashback_estornar_resgate(uuid) from public, anon;

-- ------------------------------------------------------------------ tabela
-- Pela sessão só se LÊ o extrato; crédito e resgate só pelas funções acima.
drop policy if exists cashback_mov_modulo on public.cashback_mov;
drop policy if exists cashback_mov_leitura on public.cashback_mov;
create policy cashback_mov_leitura on public.cashback_mov for select to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('delivery')) or (select public.tem_permissao('pdv'))));

-- Configuração (percentual, limite, formas fora): quem tem Delivery/PDV lê,
-- só o dono muda — um caixa não pode pôr 100% pra um conhecido.
drop policy if exists cashback_config_modulo on public.cashback_config;
drop policy if exists cashback_config_leitura on public.cashback_config;
drop policy if exists cashback_config_dono on public.cashback_config;
create policy cashback_config_leitura on public.cashback_config for select to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('delivery')) or (select public.tem_permissao('pdv'))));
create policy cashback_config_dono on public.cashback_config for all to authenticated
  using (empresa_id = public.empresa_atual() and (select public.sou_dono()))
  with check (empresa_id = public.empresa_atual() and (select public.sou_dono()));

notify pgrst, 'reload schema';
