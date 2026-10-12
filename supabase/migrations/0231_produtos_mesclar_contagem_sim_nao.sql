-- PRODUTOS: MESCLAR DUPLICADOS + CONTAGEM "PRECISA COMPRAR?" (pedido do Rafael, 12/10/2026)
--
-- 1) Mesclar: o mesmo produto acabou cadastrado duas vezes, com nomes
--    diferentes, porque veio de fornecedores diferentes. Mesclar passa TUDO do
--    duplicado (contagens, cotações, preços, pedidos, notas, etiquetas,
--    fornecedores) pro produto que fica, e desativa o duplicado.
-- 2) Contagem sim/não: itens de quantidade alta e difícil de contar (que só de
--    olhar já dá pra ver se precisa) não pedem número — a pessoa responde
--    "precisa comprar" ou "tem o suficiente".

alter table public.produtos add column if not exists contagem_sim_nao boolean not null default false;
alter table public.produtos add column if not exists mesclado_em uuid references public.produtos(id) on delete set null;
alter table public.contagem_itens add column if not exists precisa_comprar boolean;

-- ---------- contagem pelo link: devolve o sim/não ----------
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
                 'categoria', cat.nome, 'sim_nao', p.contagem_sim_nao
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
               'parcelas', ci.parcelas,
               'precisa_comprar', ci.precisa_comprar))
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
  v_pid uuid;
  v_pre boolean;
  v_parc jsonb;
  v_sn boolean;
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
$$;

create or replace function public.contar_buscar_produtos(p_token text, p_busca text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_contagem uuid;
  v_empresa  uuid;
begin
  select cl.contagem_id, c.empresa_id
    into v_contagem, v_empresa
    from contagem_links cl
    join contagens c on c.id = cl.contagem_id
   where cl.token = p_token;
  if not found then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(x.item) from (
      select jsonb_build_object(
               'id', p.id, 'nome', p.nome, 'unidade', p.unidade,
               'categoria', coalesce(cat.nome, 'Sem categoria'),
               'sim_nao', p.contagem_sim_nao) as item
      from produtos p
      left join categorias cat
        on cat.id = p.categoria_id and cat.empresa_id = v_empresa
      where p.ativo
        and p.empresa_id = v_empresa
        and unaccent(lower(p.nome)) like '%' || unaccent(lower(coalesce(p_busca, ''))) || '%'
      order by p.nome
      limit 12
    ) x
  ), '[]'::jsonb);
end;
$function$;

-- ---------- mesclar ----------
-- security invoker: as regras do banco (empresa) valem pra quem chama.
create or replace function public.mesclar_produtos(p_de uuid, p_para uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_de record;
  v_para record;
  n int;
  v_resumo jsonb := '{}'::jsonb;
begin
  perform public.exigir_logado();
  if p_de is null or p_para is null or p_de = p_para then
    return jsonb_build_object('ok', false, 'erro', 'Escolha dois produtos diferentes.');
  end if;
  select id, nome, empresa_id into v_de from produtos where id = p_de;
  select id, nome, empresa_id, ativo into v_para from produtos where id = p_para;
  if v_de.id is null or v_para.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Produto não encontrado.');
  end if;
  if v_de.empresa_id <> v_para.empresa_id then
    return jsonb_build_object('ok', false, 'erro', 'Produtos de empresas diferentes.');
  end if;

  -- Contagem: o mesmo item contado com os dois nomes na mesma contagem soma.
  update contagem_itens a
     set qtd_estoque = a.qtd_estoque + b.qtd_estoque,
         qtd_pedir = a.qtd_pedir + b.qtd_pedir,
         parcelas = case when jsonb_typeof(a.parcelas) = 'array' and jsonb_typeof(b.parcelas) = 'array'
                         then a.parcelas || b.parcelas else coalesce(a.parcelas, b.parcelas) end,
         precisa_comprar = coalesce(a.precisa_comprar, false) or coalesce(b.precisa_comprar, false)
    from contagem_itens b
   where a.produto_id = p_para and b.produto_id = p_de and a.contagem_id = b.contagem_id;
  delete from contagem_itens b where b.produto_id = p_de
     and exists (select 1 from contagem_itens a where a.produto_id = p_para and a.contagem_id = b.contagem_id);
  update contagem_itens set produto_id = p_para where produto_id = p_de;
  get diagnostics n = row_count; v_resumo := v_resumo || jsonb_build_object('contagens', n);

  -- Cotação: quantidade soma.
  update cotacao_itens a set qtd = a.qtd + b.qtd
    from cotacao_itens b
   where a.produto_id = p_para and b.produto_id = p_de and a.cotacao_id = b.cotacao_id;
  delete from cotacao_itens b where b.produto_id = p_de
     and exists (select 1 from cotacao_itens a where a.produto_id = p_para and a.cotacao_id = b.cotacao_id);
  update cotacao_itens set produto_id = p_para where produto_id = p_de;

  -- Preço do mesmo fornecedor na mesma cotação: fica o do produto que fica.
  delete from cotacao_precos b where b.produto_id = p_de
     and exists (select 1 from cotacao_precos a where a.produto_id = p_para and a.cotacao_id = b.cotacao_id and a.fornecedor_id = b.fornecedor_id);
  update cotacao_precos set produto_id = p_para where produto_id = p_de;
  update cotacao_ofertas_extra set produto_id = p_para where produto_id = p_de;

  -- Pedido com os dois no mesmo pedido: soma as quantidades.
  update pedido_itens a
     set qtd = a.qtd + b.qtd,
         qtd_recebida = case when a.qtd_recebida is null and b.qtd_recebida is null then null
                             else coalesce(a.qtd_recebida, 0) + coalesce(b.qtd_recebida, 0) end,
         qtd_conf_colab = case when a.qtd_conf_colab is null and b.qtd_conf_colab is null then null
                               else coalesce(a.qtd_conf_colab, 0) + coalesce(b.qtd_conf_colab, 0) end
    from pedido_itens b
   where a.produto_id = p_para and b.produto_id = p_de and a.pedido_id = b.pedido_id;
  delete from pedido_itens b where b.produto_id = p_de
     and exists (select 1 from pedido_itens a where a.produto_id = p_para and a.pedido_id = b.pedido_id);
  update pedido_itens set produto_id = p_para where produto_id = p_de;
  get diagnostics n = row_count; v_resumo := v_resumo || jsonb_build_object('pedidos', n);

  -- Fornecedores que vendem: o duplicado traz os dele.
  delete from fornecedor_produto b where b.produto_id = p_de
     and exists (select 1 from fornecedor_produto a where a.produto_id = p_para and a.fornecedor_id = b.fornecedor_id);
  update fornecedor_produto set produto_id = p_para where produto_id = p_de;
  get diagnostics n = row_count; v_resumo := v_resumo || jsonb_build_object('fornecedores', n);

  -- CMV manual: valor soma.
  update cmv_compras_manual a set valor = a.valor + b.valor
    from cmv_compras_manual b
   where a.produto_id = p_para and b.produto_id = p_de and a.contagem_id = b.contagem_id;
  delete from cmv_compras_manual b where b.produto_id = p_de
     and exists (select 1 from cmv_compras_manual a where a.produto_id = p_para and a.contagem_id = b.contagem_id);
  update cmv_compras_manual set produto_id = p_para where produto_id = p_de;

  -- Notas (e o que a nota aprendeu), etiquetas.
  update nota_itens set produto_id = p_para where produto_id = p_de;
  get diagnostics n = row_count; v_resumo := v_resumo || jsonb_build_object('notas', n);
  update etiqueta_itens set produto_id = p_para where produto_id = p_de;
  update etiquetas set produto_id = p_para where produto_id = p_de;

  -- O duplicado sai de cena (fica no banco, desativado, apontando pro que ficou).
  update produtos set ativo = false, mesclado_em = p_para where id = p_de;
  update produtos set ativo = true where id = p_para and not ativo;

  return jsonb_build_object('ok', true, 'de', v_de.nome, 'para', v_para.nome, 'resumo', v_resumo);
end;
$$;
revoke all on function public.mesclar_produtos(uuid, uuid) from public, anon;
grant execute on function public.mesclar_produtos(uuid, uuid) to authenticated;
