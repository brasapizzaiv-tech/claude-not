-- "Chegou desde a última contagem" = o MAIOR entre (a) itens de notas fiscais
-- e (b) itens dos pedidos gerados pela cotação (qualquer status — o pedido
-- quase nunca é marcado como conferido). Pegar o maior evita somar duas vezes a
-- mesma compra (pedido + nota do mesmo produto) e cobre quando só um dos dois
-- foi registrado.
create or replace function public.contagem_referencia(p_contagem_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ini timestamptz;
begin
  select c.criado_em into v_ini from contagens c where c.id = p_contagem_id;
  if v_ini is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'produto_id', u.produto_id,
             'ultima_qtd', u.qtd,
             'ultima_data', u.data,
             'comprado', greatest(
               coalesce((
                 select sum(
                   case
                     when upper(coalesce(ni.unidade, '')) in ('CX','CXA','FD','FDO','PCT','PC','SC','ENG','DZ','PACK')
                          and coalesce(pr.fardo, 0) > 0
                       then ni.qtd * pr.fardo
                     else ni.qtd
                   end)
                 from nota_itens ni
                 join notas_fiscais nf on nf.id = ni.nota_id
                 join produtos pr on pr.id = ni.produto_id
                 where ni.produto_id = u.produto_id
                   and nf.data_emissao > u.data
                   and nf.data_emissao <= current_date
                   and coalesce(nf.situacao, '') <> 'cancelada'
               ), 0),
               coalesce((
                 select sum(coalesce(pi.qtd_recebida, pi.qtd))
                 from pedido_itens pi
                 join pedidos p on p.id = pi.pedido_id
                 where pi.produto_id = u.produto_id
                   and p.criado_em > u.criado_em
                   and p.criado_em <= now()
               ), 0)
             ),
             'comprado_notas', coalesce((
                 select sum(ni.qtd) from nota_itens ni join notas_fiscais nf on nf.id = ni.nota_id
                 where ni.produto_id = u.produto_id and nf.data_emissao > u.data and coalesce(nf.situacao, '') <> 'cancelada'), 0),
             'comprado_pedidos', coalesce((
                 select sum(coalesce(pi.qtd_recebida, pi.qtd)) from pedido_itens pi join pedidos p on p.id = pi.pedido_id
                 where pi.produto_id = u.produto_id and p.criado_em > u.criado_em), 0)
           ))
    from (
      select distinct on (ci.produto_id)
             ci.produto_id, ci.qtd_estoque as qtd, c.data, c.criado_em
      from contagem_itens ci
      join contagens c on c.id = ci.contagem_id
      where c.status = 'finalizada'
        and c.criado_em < v_ini
        and c.id <> p_contagem_id
      order by ci.produto_id, c.criado_em desc
    ) u
  ), '[]'::jsonb);
end;
$$;
