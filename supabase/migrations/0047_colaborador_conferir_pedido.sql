-- App do colaborador: conferência leve dos pedidos (só itens/quantidade que
-- chegaram), SEM afetar a conferência oficial (qtd_recebida/preco_recebido).

alter table public.pedido_itens add column if not exists qtd_conf_colab numeric;
alter table public.pedidos add column if not exists conf_colab_em timestamptz;
alter table public.pedidos add column if not exists conf_colab_por text;

-- Lista os pedidos ainda não conferidos oficialmente, para o colaborador checar.
create or replace function public.colaborador_pedidos(p_token text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pin text;
begin
  select id, pin into v_id, v_pin from colaboradores where token = p_token and ativo;
  if not found then return null; end if;
  if v_pin is not null and v_pin <> p_pin then
    return jsonb_build_object('erro', 'pin');
  end if;
  return jsonb_build_object(
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ped.id,
        'fornecedor', (select nome from fornecedores where id = ped.fornecedor_id),
        'data', ped.data,
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
    ), '[]'::jsonb)
  );
end; $$;

-- Salva a conferência leve do colaborador (quantidade que chegou por item).
create or replace function public.colaborador_conferir_pedido(
  p_token text, p_pin text, p_pedido_id uuid, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text; v_pin text; v_item jsonb;
begin
  select id, nome, pin into v_id, v_nome, v_pin
    from colaboradores where token = p_token and ativo;
  if not found then return jsonb_build_object('ok', false); end if;
  if v_pin is not null and v_pin <> p_pin then
    return jsonb_build_object('erro', 'pin');
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    update pedido_itens
       set qtd_conf_colab = nullif(v_item->>'qtd', '')::numeric
     where id = (v_item->>'id')::uuid and pedido_id = p_pedido_id;
  end loop;
  update pedidos set conf_colab_em = now(), conf_colab_por = v_nome
   where id = p_pedido_id;
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.colaborador_pedidos(text, text) to anon, authenticated;
grant execute on function public.colaborador_conferir_pedido(text, text, uuid, jsonb) to anon, authenticated;
