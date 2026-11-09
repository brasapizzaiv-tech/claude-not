-- Link de contagem (/contar/{token}) — auditoria EST-03 / SEC-13.
--
-- Antes: o link gravava em contagem já FINALIZADA (36 de 39 links apontavam pra
-- contagem finalizada e não expiram), mudando o CMV de semanas passadas, e aceitava
-- produto de qualquer empresa.
-- Agora: contagem finalizada recusa ("peça um link novo") e só entram produtos
-- ativos da empresa da contagem. Produto de outra categoria da MESMA empresa
-- continua valendo: a busca do link (contar_buscar_produtos) deixa o contador
-- incluir o que achou fora da lista dele.
create or replace function public.contar_salvar(p_token text, p_itens jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_link record;
  v_item jsonb;
  v_count int := 0;
  v_valid uuid[];
  v_pid uuid;
  v_pre boolean;
  v_parc jsonb;
  v_sn boolean;
begin
  select cl.contagem_id, cl.colaborador_id, c.status, c.empresa_id
    into v_link
  from contagem_links cl
  join contagens c on c.id = cl.contagem_id
  where cl.token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Link inválido.');
  end if;
  if v_link.status = 'finalizada' then
    return jsonb_build_object('ok', false, 'erro', 'Essa contagem já foi finalizada e não aceita mais mudanças. Peça um link novo.');
  end if;
  select array_agg(p.id) into v_valid from produtos p where p.ativo and p.empresa_id = v_link.empresa_id;
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    begin
      v_pid := (v_item->>'produto_id')::uuid;
    exception when others then
      continue;
    end;
    v_pre := coalesce(v_item->>'preenchido', '') = 'true';
    v_parc := case when jsonb_typeof(v_item->'parcelas') = 'array' then v_item->'parcelas' else null end;
    v_sn := case when jsonb_typeof(v_item->'precisa_comprar') = 'boolean' then (v_item->>'precisa_comprar')::boolean else null end;
    if v_pid = any(v_valid)
       and (v_pre
            or coalesce((v_item->>'qtd_estoque')::numeric, 0) > 0
            or coalesce((v_item->>'qtd_pedir')::numeric, 0) > 0) then
      insert into contagem_itens (contagem_id, produto_id, qtd_estoque, qtd_pedir, parcelas, precisa_comprar)
      values (
        v_link.contagem_id,
        v_pid,
        coalesce((v_item->>'qtd_estoque')::numeric, 0),
        coalesce((v_item->>'qtd_pedir')::numeric, 0),
        v_parc,
        v_sn
      )
      on conflict (contagem_id, produto_id)
      do update set qtd_estoque = excluded.qtd_estoque,
                    qtd_pedir = excluded.qtd_pedir,
                    parcelas = excluded.parcelas,
                    precisa_comprar = excluded.precisa_comprar;
      v_count := v_count + 1;
    end if;
  end loop;
  update contagem_links set status = 'preenchida' where token = p_token;
  return jsonb_build_object('ok', true, 'gravados', v_count);
end;
$function$;
