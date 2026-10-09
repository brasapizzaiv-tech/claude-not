-- Cashback no BALCÃO (PDV), pedido do Rafael em 09/10/2026: "pode pôr no PDV
-- também, mas sem ser obrigatório, só se eu quiser vincular cliente".
--
-- No balcão a venda é paga na hora, então o crédito entra junto com a venda
-- (não espera "entregue"). O movimento se liga à COMANDA em vez do pedido de
-- delivery. Canal novo na configuração: 'pdv'.

alter table public.cashback_mov
  add column if not exists comanda_id uuid references public.pdv_comandas (id) on delete set null;
create unique index if not exists cashback_credito_comanda_uq on public.cashback_mov (comanda_id) where tipo = 'credito' and comanda_id is not null;
create unique index if not exists cashback_resgate_comanda_uq on public.cashback_mov (comanda_id) where tipo = 'resgate' and comanda_id is not null;

-- Usar saldo: mesma regra (o que vence antes primeiro), agora com pedido OU comanda.
create or replace function public.cashback_resgatar_ref(p_cliente uuid, p_pedido uuid, p_comanda uuid, p_valor numeric)
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

-- Ganhar no balcão: confere a configuração (ligado, canal 'pdv', forma não
-- excluída) e credita sobre a base informada. Devolve quanto creditou.
create or replace function public.cashback_creditar_venda(p_cliente uuid, p_comanda uuid, p_base numeric, p_forma text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  c       cashback_config%rowtype;
  v_emp   uuid;
  v_valor numeric;
begin
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
$$;

-- Devolve o cashback usado numa venda de balcão que não fechou.
create or replace function public.cashback_estornar_resgate_comanda(p_comanda uuid)
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

grant execute on function public.cashback_estornar_resgate_comanda(uuid) to authenticated, service_role;
grant execute on function public.cashback_resgatar_ref(uuid, uuid, uuid, numeric) to authenticated, service_role;
grant execute on function public.cashback_resgatar(uuid, uuid, numeric) to authenticated, service_role;
grant execute on function public.cashback_creditar_venda(uuid, uuid, numeric, text) to authenticated, service_role;

-- A Brasa marcou "Loja online" e "PDV" no Manda Pedido.
update public.cashback_config set canais = array(select distinct unnest(canais || '{pdv}'::text[]));
