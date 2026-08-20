-- ST (Substituição Tributária) nos produtos + resposta do fornecedor na cotação.
-- Produto marcado com ST: na cotação o fornecedor informa se o preço já inclui a
-- ST e qual a %. O custo efetivo já sai correto (com a ST) na comparação/pedido.

alter table public.produtos
  add column if not exists tem_st        boolean not null default false,
  add column if not exists st_pct_padrao numeric;

alter table public.cotacao_precos
  add column if not exists st_inclusa boolean,
  add column if not exists st_pct     numeric;

-- Dados para o fornecedor preencher (agora com os campos de ST por item).
create or replace function public.cotar_fornecedor_dados(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cf record;
  v_result jsonb;
begin
  select cf.cotacao_id, cf.fornecedor_id, cf.prazo_entrega, cf.pedido_minimo,
         cf.condicao_pagamento, cf.observacao
    into v_cf
  from cotacao_fornecedores cf
  where cf.token = p_token;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'cotacao', (
      select jsonb_build_object('id', c.id, 'descricao', c.descricao,
                                'prazo', c.prazo, 'status', c.status)
      from cotacoes c where c.id = v_cf.cotacao_id
    ),
    'fornecedor', (select nome from fornecedores where id = v_cf.fornecedor_id),
    'prazo_entrega', v_cf.prazo_entrega,
    'pedido_minimo', v_cf.pedido_minimo,
    'condicao_pagamento', v_cf.condicao_pagamento,
    'observacao', v_cf.observacao,
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'produto_id', p.id, 'nome', p.nome, 'unidade', p.unidade,
               'marca', p.marca, 'qtd', ci.qtd,
               'preco_unit', pr.preco_unit,
               'disponivel', coalesce(pr.disponivel, true),
               'foto_url', pr.foto_url,
               'embalagem', pr.embalagem,
               'observacao', pr.observacao,
               'tem_st', p.tem_st,
               'st_pct_padrao', p.st_pct_padrao,
               'st_inclusa', pr.st_inclusa,
               'st_pct', pr.st_pct
             ) order by p.nome)
      from cotacao_itens ci
      join produtos p on p.id = ci.produto_id
      join fornecedor_produto fp
        on fp.produto_id = p.id and fp.fornecedor_id = v_cf.fornecedor_id
      left join cotacao_precos pr
        on pr.cotacao_id = v_cf.cotacao_id
       and pr.fornecedor_id = v_cf.fornecedor_id
       and pr.produto_id = p.id
      where ci.cotacao_id = v_cf.cotacao_id and ci.qtd > 0
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Salvar: agora grava também os campos de ST por item.
create or replace function public.cotar_fornecedor_salvar(p_token text, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cf record;
  v_item jsonb;
  v_count int := 0;
  v_valid uuid[];
  v_rascunho boolean := coalesce((p_dados->>'rascunho')::boolean, false);
begin
  select cf.cotacao_id, cf.fornecedor_id
    into v_cf
  from cotacao_fornecedores cf
  where cf.token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Link inválido.');
  end if;

  select array_agg(p.id) into v_valid
  from cotacao_itens ci
  join fornecedor_produto fp
    on fp.produto_id = ci.produto_id and fp.fornecedor_id = v_cf.fornecedor_id
  join produtos p on p.id = ci.produto_id
  where ci.cotacao_id = v_cf.cotacao_id and ci.qtd > 0;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_dados->'precos', '[]'::jsonb))
  loop
    if (v_item->>'produto_id')::uuid = any(v_valid) then
      insert into cotacao_precos
        (cotacao_id, fornecedor_id, produto_id, preco_unit, disponivel, foto_url,
         embalagem, observacao, st_inclusa, st_pct)
      values (
        v_cf.cotacao_id, v_cf.fornecedor_id, (v_item->>'produto_id')::uuid,
        nullif(v_item->>'preco_unit', '')::numeric,
        coalesce((v_item->>'disponivel')::boolean, true),
        nullif(v_item->>'foto_url', ''),
        nullif(v_item->>'embalagem', ''),
        nullif(v_item->>'observacao', ''),
        case when v_item ? 'st_inclusa' and v_item->>'st_inclusa' <> ''
             then (v_item->>'st_inclusa')::boolean else null end,
        nullif(v_item->>'st_pct', '')::numeric
      )
      on conflict (cotacao_id, fornecedor_id, produto_id)
      do update set preco_unit = excluded.preco_unit,
                    disponivel = excluded.disponivel,
                    foto_url   = coalesce(excluded.foto_url, cotacao_precos.foto_url),
                    embalagem  = excluded.embalagem,
                    observacao = excluded.observacao,
                    st_inclusa = excluded.st_inclusa,
                    st_pct     = excluded.st_pct;
      v_count := v_count + 1;
    end if;
  end loop;

  update cotacao_fornecedores set
    status = case when v_rascunho then status else 'respondido' end,
    prazo_entrega = nullif(p_dados->>'prazo_entrega', '')::date,
    pedido_minimo = nullif(p_dados->>'pedido_minimo', '')::numeric,
    condicao_pagamento = nullif(p_dados->>'condicao_pagamento', ''),
    observacao = nullif(p_dados->>'observacao', '')
  where token = p_token;

  return jsonb_build_object('ok', true, 'gravados', v_count);
end;
$$;

grant execute on function public.cotar_fornecedor_dados(text) to anon, authenticated;
grant execute on function public.cotar_fornecedor_salvar(text, jsonb) to anon, authenticated;
