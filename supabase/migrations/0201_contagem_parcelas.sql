-- Contagem por PARCELAS (congelado / resfriado / ambiente, mais de uma por
-- item) e leitura de ETIQUETAS na contagem.
--
-- Pedido do Rafael (28/09/2026): na contagem, dizer onde cada parte do item
-- está, e poder ler o QR das etiquetas pra contabilizar. O total continua em
-- qtd_estoque (cotação e CMV não mudam); o detalhe fica em parcelas:
--   [{ "qtd": 2, "onde": "congelado", "etiqueta_id": "...", "etiqueta_numero": 128 }, ...]

alter table public.contagem_itens
  add column if not exists parcelas jsonb;

-- contar_dados: devolve as parcelas junto com cada item já gravado.
create or replace function public.contar_dados(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_result jsonb;
begin
  select cl.contagem_id, cl.colaborador_id
    into v_link
  from contagem_links cl
  where cl.token = p_token;
  if not found then
    return null;
  end if;
  select jsonb_build_object(
    'contagem', (
      select jsonb_build_object('id', c.id, 'descricao', c.descricao, 'status', c.status)
      from contagens c where c.id = v_link.contagem_id
    ),
    'colaborador', (
      select nome from colaboradores where id = v_link.colaborador_id
    ),
    'produtos', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', p.id, 'nome', p.nome, 'unidade', p.unidade,
                 'categoria', cat.nome
               ) order by cat.nome, p.nome)
      from produtos p
      join contagem_atribuicoes a
        on a.categoria_id = p.categoria_id
       and a.contagem_id = v_link.contagem_id
       and a.colaborador_id = v_link.colaborador_id
      left join categorias cat on cat.id = p.categoria_id
      where p.ativo
    ), '[]'::jsonb),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'produto_id', ci.produto_id,
               'qtd_estoque', ci.qtd_estoque,
               'qtd_pedir', ci.qtd_pedir,
               'parcelas', ci.parcelas))
      from contagem_itens ci
      where ci.contagem_id = v_link.contagem_id
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- contar_salvar: grava as parcelas quando vierem (senão limpa, porque o total
-- mudou por outro caminho e o detalhe antigo não vale mais).
create or replace function public.contar_salvar(p_token text, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_item jsonb;
  v_count int := 0;
  v_valid uuid[];
  v_pid uuid;
  v_pre boolean;
  v_parc jsonb;
begin
  select cl.contagem_id, cl.colaborador_id
    into v_link
  from contagem_links cl
  where cl.token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Link inválido.');
  end if;
  select array_agg(p.id) into v_valid from produtos p where p.ativo;
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    begin
      v_pid := (v_item->>'produto_id')::uuid;
    exception when others then
      continue;
    end;
    v_pre := coalesce(v_item->>'preenchido', '') = 'true';
    v_parc := case when jsonb_typeof(v_item->'parcelas') = 'array' then v_item->'parcelas' else null end;
    if v_pid = any(v_valid)
       and (v_pre
            or coalesce((v_item->>'qtd_estoque')::numeric, 0) > 0
            or coalesce((v_item->>'qtd_pedir')::numeric, 0) > 0) then
      insert into contagem_itens (contagem_id, produto_id, qtd_estoque, qtd_pedir, parcelas)
      values (
        v_link.contagem_id,
        v_pid,
        coalesce((v_item->>'qtd_estoque')::numeric, 0),
        coalesce((v_item->>'qtd_pedir')::numeric, 0),
        v_parc
      )
      on conflict (contagem_id, produto_id)
      do update set qtd_estoque = excluded.qtd_estoque,
                    qtd_pedir = excluded.qtd_pedir,
                    parcelas = excluded.parcelas;
      v_count := v_count + 1;
    end if;
  end loop;
  update contagem_links set status = 'preenchida' where token = p_token;
  return jsonb_build_object('ok', true, 'gravados', v_count);
end;
$$;

-- Etiqueta lida na contagem: pelo id do QR ou pelo número impresso. Valida o
-- link do contador (mesma regra das outras contar_*) e só olha etiquetas da
-- mesma empresa da contagem. Devolve o PRODUTO da etiqueta (direto ou pelo
-- item de etiqueta), que é o que a contagem precisa pra somar no lugar certo.
create or replace function public.contar_etiqueta(p_token text, p_id uuid default null, p_numero bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_emp uuid;
  v jsonb;
begin
  select cl.contagem_id into v_link from contagem_links cl where cl.token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'mensagem', 'Link inválido.');
  end if;
  select empresa_id into v_emp from contagens where id = v_link.contagem_id;
  select jsonb_build_object(
    'ok', true,
    'id', e.id,
    'numero', e.numero,
    'produto_id', coalesce(e.produto_id, ei.produto_id),
    'produto', e.produto_nome,
    'nome_produto', p.nome,
    'quantidade', e.quantidade,
    'unidade', e.unidade,
    'conservacao', e.conservacao,
    'status', e.status,
    'validade', e.validade,
    'unidade_produto', p.unidade,
    'categoria', coalesce(cat.nome, 'Sem categoria')
  ) into v
  from etiquetas e
  left join etiqueta_itens ei on ei.id = e.item_id
  left join produtos p on p.id = coalesce(e.produto_id, ei.produto_id)
  left join categorias cat on cat.id = p.categoria_id
  where e.empresa_id = v_emp
    and ((p_id is not null and e.id = p_id) or (p_id is null and p_numero is not null and e.numero = p_numero))
  limit 1;
  if v is null then
    return jsonb_build_object('ok', false, 'mensagem', 'Etiqueta não encontrada.');
  end if;
  return v;
end;
$$;

grant execute on function public.contar_etiqueta(text, uuid, bigint) to anon, authenticated;
