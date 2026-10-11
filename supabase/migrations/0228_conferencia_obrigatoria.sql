-- CONFERÊNCIA OBRIGATÓRIA NO DIA DA ENTREGA (app da equipe) + AVISO NO ESCRITÓRIO
-- Pedido do Rafael (11/10/2026): o pessoal não respondia a conferência e os
-- pedidos ficavam sem ninguém saber se tinham chegado. Agora, no dia previsto
-- da entrega, quem faz contagem abre o app e tem que responder: "Chegou" (e
-- confere), "Ainda não chegou" (pergunta de novo em 2 h) ou "Não veio". O que
-- não veio, e o que passou do dia sem resposta, aparece no mural do escritório.
--
-- Dia da entrega = entrega_prevista (remarcada pelo escritório) → prazo da
-- cotação → dia seguinte ao pedido.

alter table public.pedidos add column if not exists cobrar_conf boolean not null default true;
alter table public.pedidos add column if not exists entrega_prevista date;
alter table public.pedidos add column if not exists adiado_ate timestamptz;
alter table public.pedidos add column if not exists nao_veio_em timestamptz;
alter table public.pedidos add column if not exists nao_veio_por text;
alter table public.pedidos add column if not exists nao_veio_obs text;
alter table public.pedidos add column if not exists aviso_encerrado_em timestamptz;

-- O que já existia não é cobrado (eram 21 pedidos de 05/10 sem conferir).
update public.pedidos set cobrar_conf = false where criado_em < now();

create or replace function public.pedido_dia_entrega(p public.pedidos) returns date
language sql stable set search_path = public as $$
  select coalesce(
    p.entrega_prevista,
    (select cf.prazo_entrega from cotacao_fornecedores cf
      where cf.cotacao_id = p.cotacao_id and cf.fornecedor_id = p.fornecedor_id limit 1),
    p.data + 1
  );
$$;

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
        and public.pedido_dia_entrega(ped) >= current_date - 10
    ), '[]'::jsonb)
  );
end; $$;
grant execute on function public.colaborador_pedidos(text, text) to anon, authenticated;

-- Resposta da equipe sem conferir: 'adiar' (ainda não chegou → pergunta de
-- novo em 2 h) ou 'nao_veio' (vai pro mural do escritório).
create or replace function public.colaborador_responder_entrega(
  p_token text, p_pin text, p_pedido_id uuid, p_resposta text, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_nome text; v_pin text;
begin
  select nome, pin into v_nome, v_pin from colaboradores where token = p_token and ativo;
  if not found then return jsonb_build_object('ok', false); end if;
  if v_pin is not null and v_pin <> p_pin then return jsonb_build_object('erro', 'pin'); end if;
  if p_resposta = 'adiar' then
    update pedidos set adiado_ate = now() + interval '2 hours'
     where id = p_pedido_id and conf_colab_em is null;
  elsif p_resposta = 'nao_veio' then
    update pedidos set nao_veio_em = now(), nao_veio_por = v_nome,
           nao_veio_obs = nullif(left(trim(coalesce(p_obs, '')), 300), ''), adiado_ate = null
     where id = p_pedido_id and conf_colab_em is null;
  else
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.colaborador_responder_entrega(text, text, uuid, text, text) to anon, authenticated;
