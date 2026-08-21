-- App do colaborador: incluir a DATA PREVISTA DE ENTREGA do pedido (informada
-- pelo fornecedor na cotação) para o colaborador saber quando o produto chega.
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
        'prazo_entrega', (
          select cf.prazo_entrega from cotacao_fornecedores cf
          where cf.cotacao_id = ped.cotacao_id
            and cf.fornecedor_id = ped.fornecedor_id
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

grant execute on function public.colaborador_pedidos(text, text) to anon, authenticated;
