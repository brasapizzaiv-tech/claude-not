-- Consumo: contagem e pedido importados ficam fora da conta (BUG-005 da auditoria, 03/11/2026).
-- A Planilha CMV entrou em 20/08 com 3 contagens de datas antigas (03, 09 e 16/08) e 2 pedidos,
-- todos com o mesmo criado_em. Os trechos de 0 dias repetiam a mesma compra e a barra da semana
-- de 17/08 estourava (tampa TP 200: 6.530 un, quando o normal é ~400). Importado = criado mais de
-- 2 dias depois da própria data: o horário dele não diz quando a contagem ou a compra aconteceu.

create or replace function public.consumo_periodos(p_desde date)
returns table (
  produto_id uuid,
  ini timestamptz,
  fim timestamptz,
  qtd_ini numeric,
  qtd_fim numeric,
  entrou numeric,
  consumo numeric,
  dias numeric,
  fator_suspeito numeric,
  nota_suspeita uuid,
  maior_contagem numeric
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
      and c.criado_em::date <= c.data + 2
    order by ci.produto_id, c.data, c.criado_em desc
  ),
  maior as (
    select d.produto_id, max(d.qtd) as qtd from dia d group by d.produto_id
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
    select ni.produto_id, nf.entrada_em as t, nf.id as nota_id, ni.qtd,
      case
        when coalesce(ni.fator, 1) > 1 then ni.fator
        when upper(coalesce(ni.unidade, '')) in ('CX','CXA','FD','FDO','PCT','PC','SC','ENG','DZ','PACK','CJ')
             and coalesce(pr.fardo, 0) > 0
          then pr.fardo
        else 1
      end as f
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
      and pe.criado_em::date <= pe.data + 2
  ),
  pares as (
    select * from par p where p.ini is not null and p.fim > p.ini and p.fim::date >= p_desde
  ),
  por_nota as (
    select p.produto_id, p.fim, sum(e.qtd * e.f) as q, max(e.f) as f_max,
           (array_agg(e.nota_id order by e.f desc))[1] as nota_f
    from pares p join ent e on e.produto_id = p.produto_id and e.t > p.ini and e.t <= p.fim
    group by p.produto_id, p.fim
  ),
  por_pedido as (
    select p.produto_id, p.fim, sum(e.q) as q
    from pares p join ped e on e.produto_id = p.produto_id and e.t > p.ini and e.t <= p.fim
    group by p.produto_id, p.fim
  ),
  com_entrada as (
    select p.*, greatest(coalesce(n.q, 0), coalesce(d.q, 0)) as entrou, n.f_max, n.nota_f, m.qtd as maior_qtd,
           (m.qtd > 0 and n.f_max > 5 * m.qtd) as fora
    from pares p
    left join por_nota n on n.produto_id = p.produto_id and n.fim = p.fim
    left join por_pedido d on d.produto_id = p.produto_id and d.fim = p.fim
    left join maior m on m.produto_id = p.produto_id
  )
  select c.produto_id, c.ini, c.fim, c.qtd_ini, c.qtd_fim, c.entrou,
         c.qtd_ini + c.entrou - c.qtd_fim as consumo,
         round(extract(epoch from (c.fim - c.ini)) / 86400.0, 2) as dias,
         case when c.fora then c.f_max end as fator_suspeito,
         case when c.fora then c.nota_f end as nota_suspeita,
         c.maior_qtd as maior_contagem
  from com_entrada c;
$function$;
