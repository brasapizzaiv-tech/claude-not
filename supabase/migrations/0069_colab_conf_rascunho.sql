-- App do colaborador: salvar as quantidades SEM marcar o pedido como conferido
-- (rascunho) — usado ao adicionar/remover item, para não marcar tudo conferido
-- só porque o colaborador mexeu na lista. Novo parâmetro p_marcar (default true).
drop function if exists public.colaborador_conferir_pedido(text, text, uuid, jsonb);

create or replace function public.colaborador_conferir_pedido(
  p_token text, p_pin text, p_pedido_id uuid, p_itens jsonb, p_marcar boolean default true)
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
  -- Só marca como conferido quando p_marcar (o botão "Confirmar recebimento").
  if p_marcar then
    update pedidos set conf_colab_em = now(), conf_colab_por = v_nome
     where id = p_pedido_id;
  end if;
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.colaborador_conferir_pedido(text, text, uuid, jsonb, boolean) to anon, authenticated;
