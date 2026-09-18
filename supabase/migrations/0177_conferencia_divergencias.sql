-- Conferência: divergências gravadas no pedido (calculadas pelo sistema a
-- partir do pedido × contagem da equipe/painel × nota fiscal ligada) e a
-- conferência da equipe pelo app passa a mudar o status do pedido pra
-- "recebido" (antes ficava "rascunho" até alguém mexer no painel).
alter table public.pedidos add column if not exists divergencias   jsonb   not null default '{}'::jsonb;
alter table public.pedidos add column if not exists divergencias_n integer not null default 0;
create index if not exists pedidos_divergencias_idx on public.pedidos (divergencias_n) where divergencias_n > 0;

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
       set qtd_conf_colab = public._num_br(v_item->>'qtd')
     where id = (v_item->>'id')::uuid and pedido_id = p_pedido_id;
  end loop;
  if p_marcar then
    -- Confirmou o recebimento: o pedido vira "recebido" na lista do painel
    -- (sem mexer no que já foi conferido/finalizado lá).
    update pedidos
       set conf_colab_em = now(), conf_colab_por = v_nome,
           status = case when status in ('rascunho', 'enviado') then 'recebido' else status end
     where id = p_pedido_id;
  end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.colaborador_conferir_pedido(text, text, uuid, jsonb, boolean) to anon, authenticated;
