-- Funções seguras para o preenchimento público da contagem via token.
-- São SECURITY DEFINER (rodam como dono, ignorando RLS internamente), mas só
-- fazem o que o token autoriza. Assim o link público usa a chave ANON (pública)
-- e não precisa da chave secreta (service_role) na hospedagem.

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
               'qtd_pedir', ci.qtd_pedir))
      from contagem_itens ci
      where ci.contagem_id = v_link.contagem_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

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
begin
  select cl.contagem_id, cl.colaborador_id
    into v_link
  from contagem_links cl
  where cl.token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Link inválido.');
  end if;

  select array_agg(p.id) into v_valid
  from produtos p
  join contagem_atribuicoes a on a.categoria_id = p.categoria_id
  where a.contagem_id = v_link.contagem_id
    and a.colaborador_id = v_link.colaborador_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    if (v_item->>'produto_id')::uuid = any(v_valid)
       and (coalesce((v_item->>'qtd_estoque')::numeric, 0) > 0
            or coalesce((v_item->>'qtd_pedir')::numeric, 0) > 0) then
      insert into contagem_itens (contagem_id, produto_id, qtd_estoque, qtd_pedir)
      values (
        v_link.contagem_id,
        (v_item->>'produto_id')::uuid,
        coalesce((v_item->>'qtd_estoque')::numeric, 0),
        coalesce((v_item->>'qtd_pedir')::numeric, 0)
      )
      on conflict (contagem_id, produto_id)
      do update set qtd_estoque = excluded.qtd_estoque,
                    qtd_pedir = excluded.qtd_pedir;
      v_count := v_count + 1;
    end if;
  end loop;

  update contagem_links set status = 'preenchida' where token = p_token;
  return jsonb_build_object('ok', true, 'gravados', v_count);
end;
$$;

grant execute on function public.contar_dados(text) to anon, authenticated;
grant execute on function public.contar_salvar(text, jsonb) to anon, authenticated;
