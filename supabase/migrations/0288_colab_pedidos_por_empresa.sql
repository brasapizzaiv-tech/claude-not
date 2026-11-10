-- App da equipe (/eu): pedidos de compra só da própria empresa e só de quem
-- confere entrega (auditoria SEC-10, Onda 3).
--
-- Antes, qualquer colaborador ativo (token + PIN) apagava QUALQUER item de
-- pedido pelo id, mudava a quantidade conferida e marcava "recebido/não veio"
-- em qualquer pedido, e colaborador_pedidos devolvia os pedidos e produtos de
-- todas as empresas. Agora:
--   * quem não tem a caixinha "faz contagem" (a mesma que mostra os pedidos na
--     tela) é recusado;
--   * pedido, item e produto precisam ser da empresa do colaborador;
--   * pedido já conferido no painel não muda mais pelo app;
--   * o colaborador só remove item que ele mesmo incluiu no app (qtd pedida 0).
-- As assinaturas não mudam (o app chama igual).

-- Quem está chamando: colaborador ativo, PIN certo e que confere entregas.
-- Devolve null quando pode; senão o jsonb do erro (mesmo formato de antes).
-- Só pode ser chamada de dentro das funções abaixo (security invoker +
-- exigir_interno, padrão da 0216): chamada direto pela API, trava.
create or replace function public._colab_conferente(p_token text, p_pin text, out v_id uuid, out v_nome text, out v_empresa uuid, out v_erro jsonb)
language plpgsql
volatile
security invoker
set search_path to 'public'
as $function$
declare v_faz boolean;
begin
  perform public.exigir_interno();
  select id, nome, empresa_id, faz_contagem into v_id, v_nome, v_empresa, v_faz
    from colaboradores where token = p_token and ativo;
  if v_id is null then v_erro := jsonb_build_object('ok', false); return; end if;
  if not public.colab_pin_ok(p_token, p_pin) then v_erro := jsonb_build_object('erro', 'pin'); return; end if;
  if v_faz is false then v_erro := jsonb_build_object('ok', false, 'erro', 'sem_permissao'); return; end if;
  v_erro := null;
end; $function$;

create or replace function public.colaborador_remove_item(p_token text, p_pin text, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c record;
begin
  select * into c from public._colab_conferente(p_token, p_pin);
  if c.v_erro is not null then return c.v_erro; end if;
  delete from pedido_itens pi
   using pedidos p
   where pi.id = p_item_id
     and p.id = pi.pedido_id
     and p.empresa_id = c.v_empresa
     and p.status <> 'conferido'
     and coalesce(pi.qtd, 0) = 0;   -- só o que foi incluído pelo app
  return jsonb_build_object('ok', true);
end; $function$;

create or replace function public.colaborador_add_item(p_token text, p_pin text, p_pedido_id uuid, p_produto_id uuid, p_qtd numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c record;
begin
  select * into c from public._colab_conferente(p_token, p_pin);
  if c.v_erro is not null then return c.v_erro; end if;
  if not exists (select 1 from pedidos where id = p_pedido_id and empresa_id = c.v_empresa and status <> 'conferido') then
    return jsonb_build_object('ok', false);
  end if;
  if not exists (select 1 from produtos where id = p_produto_id and empresa_id = c.v_empresa) then
    return jsonb_build_object('ok', false);
  end if;
  insert into pedido_itens (pedido_id, produto_id, qtd, qtd_conf_colab, empresa_id)
  values (p_pedido_id, p_produto_id, 0, p_qtd, c.v_empresa);
  return jsonb_build_object('ok', true);
end; $function$;

create or replace function public.colaborador_conferir_pedido(p_token text, p_pin text, p_pedido_id uuid, p_itens jsonb, p_marcar boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c record; v_item jsonb;
begin
  select * into c from public._colab_conferente(p_token, p_pin);
  if c.v_erro is not null then return c.v_erro; end if;
  if not exists (select 1 from pedidos where id = p_pedido_id and empresa_id = c.v_empresa and status <> 'conferido') then
    return jsonb_build_object('ok', false);
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    update pedido_itens
       set qtd_conf_colab = public._num_br(v_item->>'qtd')
     where id = (v_item->>'id')::uuid and pedido_id = p_pedido_id;
  end loop;
  if p_marcar then
    -- Confirmou o recebimento: o pedido vira "recebido" na lista do painel
    -- (sem mexer no que já foi conferido/finalizado lá).
    update pedidos
       set conf_colab_em = now(), conf_colab_por = c.v_nome,
           status = case when status in ('rascunho', 'enviado') then 'recebido' else status end
     where id = p_pedido_id;
  end if;
  return jsonb_build_object('ok', true);
end; $function$;

create or replace function public.colaborador_responder_entrega(p_token text, p_pin text, p_pedido_id uuid, p_resposta text, p_obs text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c record;
begin
  select * into c from public._colab_conferente(p_token, p_pin);
  if c.v_erro is not null then return c.v_erro; end if;
  if p_resposta = 'adiar' then
    update pedidos set adiado_ate = now() + interval '2 hours'
     where id = p_pedido_id and empresa_id = c.v_empresa and conf_colab_em is null and status <> 'conferido';
  elsif p_resposta = 'nao_veio' then
    update pedidos set nao_veio_em = now(), nao_veio_por = c.v_nome,
           nao_veio_obs = nullif(left(trim(coalesce(p_obs, '')), 300), ''), adiado_ate = null
     where id = p_pedido_id and empresa_id = c.v_empresa and conf_colab_em is null and status <> 'conferido';
  else
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true);
end; $function$;

-- A lista: só a empresa do colaborador. Quem não confere recebe lista vazia
-- (a tela já esconde os pedidos dele).
create or replace function public.colaborador_pedidos(p_token text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid; v_emp uuid; v_faz boolean;
begin
  select id, empresa_id, faz_contagem into v_id, v_emp, v_faz from colaboradores where token = p_token and ativo;
  if v_id is null then return null; end if;
  if not public.colab_pin_ok(p_token, p_pin) then
    return jsonb_build_object('erro', 'pin');
  end if;
  if v_faz is false then
    return jsonb_build_object('produtos', '[]'::jsonb, 'pedidos', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by nome)
      from produtos where ativo and empresa_id = v_emp
    ), '[]'::jsonb),
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ped.id,
        'fornecedor', (select nome from fornecedores where id = ped.fornecedor_id),
        'data', ped.data,
        'prazo_entrega', (
          select cf.prazo_entrega from cotacao_fornecedores cf
          where cf.cotacao_id = ped.cotacao_id and cf.fornecedor_id = ped.fornecedor_id
          limit 1
        ),
        'entrega', public.pedido_dia_entrega(ped),
        'cobrar', ped.cobrar_conf and ped.aviso_encerrado_em is null,
        'adiado_ate', ped.adiado_ate,
        'nao_veio_em', ped.nao_veio_em,
        'nao_veio_por', ped.nao_veio_por,
        'status', ped.status,
        'conf_em', ped.conf_colab_em,
        'conf_por', ped.conf_colab_por,
        'itens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', pi.id, 'nome', pr.nome, 'unidade', pr.unidade,
            'qtd', pi.qtd, 'qtd_conf', pi.qtd_conf_colab
          ) order by pr.nome)
          from pedido_itens pi join produtos pr on pr.id = pi.produto_id
          where pi.pedido_id = ped.id
        ), '[]'::jsonb)
      ) order by ped.data desc, ped.criado_em desc)
      from pedidos ped
      where ped.status <> 'conferido'
        and ped.empresa_id = v_emp
        and public.pedido_dia_entrega(ped) >= current_date - 10
    ), '[]'::jsonb)
  );
end; $function$;
