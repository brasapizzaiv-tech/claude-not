-- Consumo dos produtos (Rafael, 19/10/2026): a cada contagem já se sabe o que
-- tinha antes, o que chegou e o que tem agora. Entre duas contagens seguidas
-- do mesmo produto:  consumo = tinha + chegou − tem agora.
--  * "Chegou" = mesma regra do "chegou depois" da contagem (notas com entrada
--    no intervalo, fator/fardo, sem item de sócio/funcionário; ou pedidos —
--    o maior dos dois).
--  * Mais de uma contagem no mesmo dia vale a última.
-- Lida com RLS de quem chama (security invoker): logado vê a própria empresa.
create or replace function public.consumo_periodos(p_desde date)
returns table (
  produto_id uuid,
  ini timestamptz,
  fim timestamptz,
  qtd_ini numeric,
  qtd_fim numeric,
  entrou numeric,
  consumo numeric,
  dias numeric
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with dia as (
    -- última contagem de cada dia, por produto (itens "precisa comprar?" não têm quantidade)
    select distinct on (ci.produto_id, c.data)
           ci.produto_id, c.criado_em, ci.qtd_estoque as qtd
    from contagem_itens ci
    join contagens c on c.id = ci.contagem_id
    where c.status = 'finalizada'
      and ci.precisa_comprar is null
      and c.data >= p_desde - 45
    order by ci.produto_id, c.data, c.criado_em desc
  ),
  par as (
    select d.produto_id,
           lag(d.criado_em) over w as ini,
           d.criado_em as fim,
           lag(d.qtd) over w as qtd_ini,
           d.qtd as qtd_fim
    from dia d
    window w as (partition by d.produto_id order by d.criado_em)
  ),
  -- Entradas do período todo, numa passada só (por intervalo era 10× mais lento).
  ent as (
    select ni.produto_id, nf.entrada_em as t,
      case
        when coalesce(ni.fator, 1) > 1 then ni.qtd * ni.fator
        when upper(coalesce(ni.unidade, '')) in ('CX','CXA','FD','FDO','PCT','PC','SC','ENG','DZ','PACK','CJ')
             and coalesce(pr.fardo, 0) > 0
          then ni.qtd * pr.fardo
        else ni.qtd
      end as q
    from nota_itens ni
    join notas_fiscais nf on nf.id = ni.nota_id
    join produtos pr on pr.id = ni.produto_id
    where ni.destino is null
      and nf.entrada_em >= (p_desde - 46)
      and coalesce(nf.situacao, '') <> 'cancelada'
  ),
  ped as (
    select pi.produto_id, pe.criado_em as t, coalesce(pi.qtd_recebida, pi.qtd) as q
    from pedido_itens pi
    join pedidos pe on pe.id = pi.pedido_id
    where pe.criado_em >= (p_desde - 46)
  ),
  pares as (
    select * from par p where p.ini is not null and p.fim::date >= p_desde
  ),
  por_nota as (
    select p.produto_id, p.fim, sum(e.q) as q
    from pares p join ent e on e.produto_id = p.produto_id and e.t > p.ini and e.t <= p.fim
    group by p.produto_id, p.fim
  ),
  por_pedido as (
    select p.produto_id, p.fim, sum(e.q) as q
    from pares p join ped e on e.produto_id = p.produto_id and e.t > p.ini and e.t <= p.fim
    group by p.produto_id, p.fim
  ),
  com_entrada as (
    select p.*, greatest(coalesce(n.q, 0), coalesce(d.q, 0)) as entrou
    from pares p
    left join por_nota n on n.produto_id = p.produto_id and n.fim = p.fim
    left join por_pedido d on d.produto_id = p.produto_id and d.fim = p.fim
  )
  select produto_id, ini, fim, qtd_ini, qtd_fim, entrou,
         qtd_ini + entrou - qtd_fim as consumo,
         round(extract(epoch from (fim - ini)) / 86400.0, 2) as dias
  from com_entrada;
$function$;

grant execute on function public.consumo_periodos(date) to authenticated, service_role;

-- Referência da contagem ganha o consumo médio por semana (últimas 8 semanas;
-- intervalo com consumo negativo = contagem errada, fica fora da média).
CREATE OR REPLACE FUNCTION public._contagem_referencia(p_contagem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_ini timestamptz;
begin
  perform public.exigir_interno();
  select c.criado_em into v_ini from contagens c where c.id = p_contagem_id;
  if v_ini is null then return '[]'::jsonb; end if;

  return coalesce((
    with cm as (
      select cp.produto_id,
             sum(cp.consumo) filter (where cp.consumo >= 0) as consumo,
             sum(cp.dias) filter (where cp.consumo >= 0) as dias
      from public.consumo_periodos((now() at time zone 'America/Sao_Paulo')::date - 56) cp
      group by cp.produto_id
    )
    select jsonb_agg(jsonb_build_object(
             'produto_id', u.produto_id,
             'ultima_qtd', u.qtd,
             'ultima_data', u.data,
             'consumo_semana', case when cm.dias >= 3 then round(cm.consumo / cm.dias * 7, 2) end,
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
                   and ni.destino is null
                   and nf.entrada_em is not null
                   and nf.entrada_em > u.criado_em
                   and nf.entrada_em <= now()
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
    left join cm on cm.produto_id = u.produto_id
  ), '[]'::jsonb);
end;
$function$;
