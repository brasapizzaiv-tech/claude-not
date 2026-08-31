-- Produto EXCLUSIVO (produtos.exclusivo, migration 0077) é de UM fornecedor:
-- 1) não aparece mais na lista "Outros itens" dos demais fornecedores;
-- 2) o salvar recusa preço de exclusivo vindo de quem não é o fornecedor dele.

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
         cf.condicao_pagamento, cf.observacao, cf.promocao_texto, cf.promocao_foto
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
    'promocao_texto', v_cf.promocao_texto,
    'promocao_foto', v_cf.promocao_foto,
    'produtos', coalesce((
      select jsonb_agg(item order by nome) from (
        select p.nome as nome, jsonb_build_object(
                 'produto_id', p.id, 'nome', p.nome, 'unidade', p.unidade,
                 'marca', p.marca, 'qtd', ci.qtd,
                 'preco_unit', pr.preco_unit,
                 'disponivel', coalesce(pr.disponivel, true),
                 'foto_url', pr.foto_url,
                 'embalagem', pr.embalagem,
                 'tamanho_embalagem', pr.tamanho_embalagem,
                 'observacao', pr.observacao,
                 'tem_st', p.tem_st, 'st_pct_padrao', p.st_pct_padrao,
                 'st_inclusa', pr.st_inclusa, 'st_pct', pr.st_pct,
                 'extras', public._cotar_extras(v_cf.cotacao_id, v_cf.fornecedor_id, p.id)
               ) as item
        from cotacao_itens ci
        join produtos p on p.id = ci.produto_id
        join fornecedor_produto fp
          on fp.produto_id = p.id and fp.fornecedor_id = v_cf.fornecedor_id
        left join cotacao_precos pr
          on pr.cotacao_id = v_cf.cotacao_id and pr.fornecedor_id = v_cf.fornecedor_id
         and pr.produto_id = p.id
        where ci.cotacao_id = v_cf.cotacao_id and ci.qtd > 0
      ) t
    ), '[]'::jsonb),
    'outros', coalesce((
      select jsonb_agg(item order by nome) from (
        select p.nome as nome, jsonb_build_object(
                 'produto_id', p.id, 'nome', p.nome, 'unidade', p.unidade,
                 'marca', p.marca, 'qtd', ci.qtd,
                 'preco_unit', pr.preco_unit,
                 'disponivel', coalesce(pr.disponivel, true),
                 'foto_url', pr.foto_url,
                 'embalagem', pr.embalagem,
                 'tamanho_embalagem', pr.tamanho_embalagem,
                 'observacao', pr.observacao,
                 'tem_st', p.tem_st, 'st_pct_padrao', p.st_pct_padrao,
                 'st_inclusa', pr.st_inclusa, 'st_pct', pr.st_pct,
                 'extras', public._cotar_extras(v_cf.cotacao_id, v_cf.fornecedor_id, p.id)
               ) as item
        from cotacao_itens ci
        join produtos p on p.id = ci.produto_id
        left join cotacao_precos pr
          on pr.cotacao_id = v_cf.cotacao_id and pr.fornecedor_id = v_cf.fornecedor_id
         and pr.produto_id = p.id
        where ci.cotacao_id = v_cf.cotacao_id and ci.qtd > 0
          -- exclusivo NÃO aparece pros outros fornecedores
          and not coalesce(p.exclusivo, false)
          and not exists (
            select 1 from fornecedor_produto fp
            where fp.produto_id = p.id and fp.fornecedor_id = v_cf.fornecedor_id
          )
      ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Salvar: v_valid deixa de aceitar exclusivo de quem não é o fornecedor dele.
create or replace function public.cotar_fornecedor_salvar(p_token text, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cf record;
  v_item jsonb;
  v_extra jsonb;
  v_pid uuid;
  v_count int := 0;
  v_valid uuid[];
  v_rascunho boolean := coalesce(nullif(p_dados->>'rascunho',''), 'false')::boolean;
begin
  select cf.cotacao_id, cf.fornecedor_id
    into v_cf
  from cotacao_fornecedores cf
  where cf.token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Link inválido.');
  end if;

  select array_agg(ci.produto_id) into v_valid
  from cotacao_itens ci
  join produtos p on p.id = ci.produto_id
  where ci.cotacao_id = v_cf.cotacao_id and ci.qtd > 0
    and (not coalesce(p.exclusivo, false)
         or exists (
           select 1 from fornecedor_produto fp
           where fp.produto_id = p.id and fp.fornecedor_id = v_cf.fornecedor_id
         ));

  for v_item in
    select * from jsonb_array_elements(coalesce(p_dados->'precos', '[]'::jsonb))
  loop
    begin
      v_pid := (v_item->>'produto_id')::uuid;
    exception when others then
      continue;
    end;
    if v_pid = any(v_valid) then
      insert into fornecedor_produto (fornecedor_id, produto_id)
      values (v_cf.fornecedor_id, v_pid)
      on conflict (fornecedor_id, produto_id) do nothing;

      insert into cotacao_precos
        (cotacao_id, fornecedor_id, produto_id, preco_unit, disponivel, foto_url,
         embalagem, tamanho_embalagem, observacao, st_inclusa, st_pct)
      values (
        v_cf.cotacao_id, v_cf.fornecedor_id, v_pid,
        public._num_br(v_item->>'preco_unit'),
        coalesce(nullif(v_item->>'disponivel','') = 'true', true),
        nullif(v_item->>'foto_url', ''),
        nullif(v_item->>'embalagem', ''),
        nullif(v_item->>'tamanho_embalagem', ''),
        nullif(v_item->>'observacao', ''),
        case when v_item ? 'st_inclusa' and v_item->>'st_inclusa' in ('true','false')
             then (v_item->>'st_inclusa')::boolean else null end,
        public._num_br(v_item->>'st_pct')
      )
      on conflict (cotacao_id, fornecedor_id, produto_id)
      do update set preco_unit = excluded.preco_unit,
                    disponivel = excluded.disponivel,
                    foto_url   = coalesce(excluded.foto_url, cotacao_precos.foto_url),
                    embalagem  = excluded.embalagem,
                    tamanho_embalagem = excluded.tamanho_embalagem,
                    observacao = excluded.observacao,
                    st_inclusa = excluded.st_inclusa,
                    st_pct     = excluded.st_pct;

      delete from cotacao_ofertas_extra
      where cotacao_id = v_cf.cotacao_id and fornecedor_id = v_cf.fornecedor_id
        and produto_id = v_pid;
      for v_extra in
        select * from jsonb_array_elements(coalesce(v_item->'extras', '[]'::jsonb))
      loop
        if nullif(v_extra->>'preco_unit', '') is not null
           or nullif(v_extra->>'marca', '') is not null then
          insert into cotacao_ofertas_extra
            (cotacao_id, fornecedor_id, produto_id, marca, preco_unit, embalagem,
             tamanho_embalagem, observacao, st_inclusa, st_pct)
          values (
            v_cf.cotacao_id, v_cf.fornecedor_id, v_pid,
            nullif(v_extra->>'marca', ''),
            public._num_br(v_extra->>'preco_unit'),
            nullif(v_extra->>'embalagem', ''),
            nullif(v_extra->>'tamanho_embalagem', ''),
            nullif(v_extra->>'observacao', ''),
            case when v_extra ? 'st_inclusa' and v_extra->>'st_inclusa' in ('true','false')
                 then (v_extra->>'st_inclusa')::boolean else null end,
            public._num_br(v_extra->>'st_pct')
          );
        end if;
      end loop;

      v_count := v_count + 1;
    end if;
  end loop;

  update cotacao_fornecedores set
    status = case when v_rascunho then status else 'respondido' end,
    prazo_entrega = public._data_segura(p_dados->>'prazo_entrega'),
    pedido_minimo = public._num_br(p_dados->>'pedido_minimo'),
    condicao_pagamento = nullif(p_dados->>'condicao_pagamento', ''),
    observacao = nullif(p_dados->>'observacao', ''),
    promocao_texto = nullif(p_dados->>'promocao_texto', ''),
    promocao_foto = coalesce(nullif(p_dados->>'promocao_foto', ''), promocao_foto)
  where token = p_token;

  return jsonb_build_object('ok', true, 'gravados', v_count);
end;
$$;
