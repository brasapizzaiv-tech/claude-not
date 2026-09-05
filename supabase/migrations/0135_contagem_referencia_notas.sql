-- "Chegou desde a última contagem" agora vem das NOTAS FISCAIS (itens vinculados
-- ao produto) — é o que a Brasa realmente registra (a conferência de pedidos quase
-- não é usada). Pedidos conferidos SEM nota ligada também entram (sem duplicar).
-- Unidade da nota em caixa/fardo (CX, FD, PCT…) com fardo cadastrado no produto
-- é convertida pra unidades.
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
             'comprado',
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
               ), 0)
               + coalesce((
                 select sum(coalesce(pi.qtd_recebida, pi.qtd))
                 from pedido_itens pi
                 join pedidos p on p.id = pi.pedido_id
                 where pi.produto_id = u.produto_id
                   and p.status in ('recebido', 'conferido')
                   and coalesce(p.conferido_em, p.criado_em) > u.criado_em
                   and coalesce(p.conferido_em, p.criado_em) <= now()
                   and not exists (select 1 from notas_fiscais nf2 where nf2.pedido_id = p.id)
               ), 0)
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
