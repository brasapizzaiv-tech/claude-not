-- App do colaborador: adicionar item que veio a mais e remover item na
-- conferência leve. E devolver a lista de produtos (para o seletor de adicionar).

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
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by nome)
      from produtos where ativo
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

-- Adiciona um item que veio a mais (qtd pedida = 0, qtd conferida = p_qtd).
create or replace function public.colaborador_add_item(
  p_token text, p_pin text, p_pedido_id uuid, p_produto_id uuid, p_qtd numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pin text;
begin
  select pin into v_pin from colaboradores where token = p_token and ativo;
  if not found then return jsonb_build_object('ok', false); end if;
  if v_pin is not null and v_pin <> p_pin then
    return jsonb_build_object('erro', 'pin');
  end if;
  insert into pedido_itens (pedido_id, produto_id, qtd, qtd_conf_colab)
  values (p_pedido_id, p_produto_id, 0, p_qtd);
  return jsonb_build_object('ok', true);
end; $$;

-- Remove um item da conferência (ex.: produto que não veio).
create or replace function public.colaborador_remove_item(
  p_token text, p_pin text, p_item_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pin text;
begin
  select pin into v_pin from colaboradores where token = p_token and ativo;
  if not found then return jsonb_build_object('ok', false); end if;
  if v_pin is not null and v_pin <> p_pin then
    return jsonb_build_object('erro', 'pin');
  end if;
  delete from pedido_itens where id = p_item_id;
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.colaborador_pedidos(text, text) to anon, authenticated;
grant execute on function public.colaborador_add_item(text, text, uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.colaborador_remove_item(text, text, uuid) to anon, authenticated;
