-- Registra QUANDO o fornecedor respondeu, para ordenar a comparação
-- por ordem de resposta (quem respondeu primeiro aparece antes).

alter table public.cotacao_fornecedores
  add column if not exists respondido_em timestamptz;

-- Carimba os que já estão como "respondido" mas sem data (retroativo).
update public.cotacao_fornecedores
   set respondido_em = coalesce(respondido_em, now())
 where status = 'respondido' and respondido_em is null;

-- Salvar: marca respondido_em no primeiro envio final (não no rascunho).
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
         embalagem, observacao)
      values (
        v_cf.cotacao_id, v_cf.fornecedor_id, (v_item->>'produto_id')::uuid,
        nullif(v_item->>'preco_unit', '')::numeric,
        coalesce((v_item->>'disponivel')::boolean, true),
        nullif(v_item->>'foto_url', ''),
        nullif(v_item->>'embalagem', ''),
        nullif(v_item->>'observacao', '')
      )
      on conflict (cotacao_id, fornecedor_id, produto_id)
      do update set preco_unit = excluded.preco_unit,
                    disponivel = excluded.disponivel,
                    foto_url   = coalesce(excluded.foto_url, cotacao_precos.foto_url),
                    embalagem  = excluded.embalagem,
                    observacao = excluded.observacao;
      v_count := v_count + 1;
    end if;
  end loop;

  update cotacao_fornecedores set
    status = case when v_rascunho then status else 'respondido' end,
    respondido_em = case when v_rascunho then respondido_em else coalesce(respondido_em, now()) end,
    prazo_entrega = nullif(p_dados->>'prazo_entrega', '')::date,
    pedido_minimo = nullif(p_dados->>'pedido_minimo', '')::numeric,
    condicao_pagamento = nullif(p_dados->>'condicao_pagamento', ''),
    observacao = nullif(p_dados->>'observacao', '')
  where token = p_token;

  return jsonb_build_object('ok', true, 'gravados', v_count);
end;
$$;

grant execute on function public.cotar_fornecedor_salvar(text, jsonb) to anon, authenticated;
