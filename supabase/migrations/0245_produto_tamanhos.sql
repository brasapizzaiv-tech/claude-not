-- Produto que vem em vários tamanhos (Rafael, 19/10/2026): ex. extrato de
-- tomate em lata/pouch de 1 kg, 1,04 kg, 1,7 kg. Continua contado e comprado
-- em UNIDADE, mas cada unidade tem um tamanho: a contagem diz quantas de cada
-- e mostra o total real (kg/L); a cotação compara preço por kg.
--   medida   = 'kg' ou 'L' (a medida dos tamanhos)
--   tamanhos = os tamanhos que existem, nessa medida (ex.: {1, 1.04, 1.7})
alter table public.produtos
  add column if not exists medida text check (medida in ('kg', 'L')),
  add column if not exists tamanhos numeric[];

-- A contagem por link (token) passa a receber os tamanhos de cada produto.
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
                 'categoria', cat.nome, 'sim_nao', p.contagem_sim_nao,
                 'medida', p.medida, 'tamanhos', p.tamanhos
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
