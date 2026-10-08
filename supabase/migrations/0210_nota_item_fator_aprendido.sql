-- Pedido do Rafael (08/10/2026): a nota lembra o produto de cada item, mas não
-- lembrava o "por un." (fator). Motivo: a coluna fator é NOT NULL DEFAULT 1, e o
-- gatilho da 0205 só herdava quando new.fator era NULL — ou seja, nunca. O
-- mesmo valia pro acerto retroativo (coalesce(ni.fator, ...)).
--
-- Agora: item novo com a mesma descrição e o mesmo fornecedor herda o produto
-- E o fator da ligação mais recente, desde que o item ainda esteja no padrão (1).
-- Quem alterar o fator numa nota ensina as próximas.
create or replace function public.nota_item_vinculo_aprendido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cnpj text;
  v_prod uuid;
  v_fator numeric;
begin
  if new.descricao is null or btrim(new.descricao) = '' then
    return new;
  end if;
  select emit_cnpj into v_cnpj from notas_fiscais where id = new.nota_id;
  if v_cnpj is null then return new; end if;

  -- A ligação mais recente do mesmo texto no mesmo fornecedor (se o item já
  -- veio com produto, só procura o fator desse mesmo produto).
  select n2.produto_id, n2.fator
    into v_prod, v_fator
    from nota_itens n2
    join notas_fiscais f2 on f2.id = n2.nota_id
   where f2.emit_cnpj = v_cnpj
     and n2.produto_id is not null
     and (new.produto_id is null or n2.produto_id = new.produto_id)
     and coalesce(f2.situacao, '') <> 'cancelada'
     and lower(btrim(n2.descricao)) = lower(btrim(new.descricao))
   order by f2.data_emissao desc nulls last, f2.criado_em desc
   limit 1;

  if v_prod is null then return new; end if;
  if new.produto_id is null then
    new.produto_id := v_prod;
  end if;
  if coalesce(new.fator, 1) = 1 and v_fator is not null and v_fator > 0 and v_fator <> 1 then
    new.fator := v_fator;
  end if;
  return new;
end;
$$;

-- Acerto retroativo só nas notas ainda PENDENTES (as lançadas já atualizaram
-- preço de referência e contagem; mexer nelas é decisão caso a caso na tela).
with alvo as (
  select distinct on (ni.id) ni.id, n2.fator
    from nota_itens ni
    join notas_fiscais f1 on f1.id = ni.nota_id
    join notas_fiscais f2 on f2.emit_cnpj = f1.emit_cnpj
                         and f2.id <> f1.id
                         and coalesce(f2.situacao, '') <> 'cancelada'
    join nota_itens n2 on n2.nota_id = f2.id
                      and n2.produto_id = ni.produto_id
                      and lower(btrim(n2.descricao)) = lower(btrim(ni.descricao))
   where ni.produto_id is not null
     and coalesce(ni.fator, 1) = 1
     and coalesce(f1.situacao, 'pendente') = 'pendente'
   order by ni.id, f2.data_emissao desc nulls last, f2.criado_em desc
)
update nota_itens ni
   set fator = alvo.fator
  from alvo
 where alvo.id = ni.id
   and alvo.fator > 0
   and alvo.fator <> 1;
