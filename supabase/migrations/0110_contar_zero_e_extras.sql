-- Contagem pública:
-- 1) ZERO agora é um valor válido — o contador marca 0 e isso FICA GRAVADO
--    (antes, 0 era ignorado e o item "sumia" da contagem).
--    O app manda "preenchido":"true" só nos itens que o contador realmente
--    respondeu; sem essa marca, vale a regra antiga (>0) — compatível com
--    telas abertas antes da atualização.
-- 2) O contador pode ADICIONAR itens que não estavam na lista dele (mas
--    existem no estoque): a validação aceita qualquer produto ativo.
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
begin
  select cl.contagem_id, cl.colaborador_id
    into v_link
  from contagem_links cl
  where cl.token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Link inválido.');
  end if;

  -- Qualquer produto ativo vale (permite itens adicionados fora da lista).
  select array_agg(p.id) into v_valid from produtos p where p.ativo;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    begin
      v_pid := (v_item->>'produto_id')::uuid;
    exception when others then
      continue;
    end;
    v_pre := coalesce(v_item->>'preenchido', '') = 'true';
    if v_pid = any(v_valid)
       and (v_pre
            or coalesce((v_item->>'qtd_estoque')::numeric, 0) > 0
            or coalesce((v_item->>'qtd_pedir')::numeric, 0) > 0) then
      insert into contagem_itens (contagem_id, produto_id, qtd_estoque, qtd_pedir)
      values (
        v_link.contagem_id,
        v_pid,
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

-- Busca de produtos pro contador ADICIONAR um item fora da lista dele.
create extension if not exists unaccent;

create or replace function public.contar_buscar_produtos(p_token text, p_busca text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
begin
  select cl.contagem_id into v_link from contagem_links cl where cl.token = p_token;
  if not found then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x.item) from (
      select jsonb_build_object(
               'id', p.id, 'nome', p.nome, 'unidade', p.unidade,
               'categoria', coalesce(cat.nome, 'Sem categoria')) as item
      from produtos p
      left join categorias cat on cat.id = p.categoria_id
      where p.ativo
        and unaccent(lower(p.nome)) like '%' || unaccent(lower(coalesce(p_busca, ''))) || '%'
      order by p.nome
      limit 12
    ) x
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.contar_buscar_produtos(text, text) to anon, authenticated;
