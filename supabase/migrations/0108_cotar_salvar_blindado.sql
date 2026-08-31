-- Cotação (fornecedor): salvar BLINDADO. Antes, UM valor fora do padrão
-- (ex.: "1.234,56", "R$ 3,90", letra no preço) estourava o cast ::numeric e
-- derrubava o salvamento INTEIRO — inclusive o auto-save, que passava a falhar
-- sempre (foi o que apagou metade da cotação da Dinâmica em 31/08).
-- Agora cada valor é convertido com tolerância (formato brasileiro) e, se não
-- der, vira NULL — nunca derruba o resto.

-- Converte texto em número aceitando formato brasileiro:
-- "2,99" → 2.99 · "1.234,56" → 1234.56 · "R$ 3.190,00" → 3190.00 · lixo → null
create or replace function public._num_br(t text)
returns numeric
language plpgsql
immutable
as $$
declare
  s text;
begin
  s := regexp_replace(coalesce(t, ''), '[^0-9,.\-]', '', 'g');
  if s = '' or s = '-' or s = '.' or s = ',' then
    return null;
  end if;
  if position(',' in s) > 0 then
    -- vírgula presente: pontos são separador de milhar
    s := replace(replace(s, '.', ''), ',', '.');
  end if;
  begin
    return s::numeric;
  exception when others then
    return null;
  end;
end;
$$;

-- Converte texto em data; se não der, null (nunca estoura).
create or replace function public._data_segura(t text)
returns date
language plpgsql
immutable
as $$
begin
  if coalesce(t, '') = '' then return null; end if;
  begin
    return t::date;
  exception when others then
    return null;
  end;
end;
$$;

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
  where ci.cotacao_id = v_cf.cotacao_id and ci.qtd > 0;

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

      -- Ofertas extras (outra marca) — substitui as do item.
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
