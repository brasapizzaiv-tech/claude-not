-- Conferência da contagem: usa o "fator" do item da nota (unidades por caixa)
-- quando informado; senão mantém a conversão pelo fardo do produto.
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
                     when coalesce(ni.fator, 1) > 1 then ni.qtd * ni.fator
                     when upper(coalesce(ni.unidade, '')) in ('CX','CXA','FD','FDO','PCT','PC','SC','ENG','DZ','PACK','CJ')
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
             )
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
