-- EST-05 (Onda 7, 11/11/2026): no consumo médio, a compra entra pela hora em que CHEGOU.
-- Antes o pedido entrava pela hora em que foi criado (~42 h antes de chegar) e a nota pela
-- hora do "Lançar" (às vezes no dia seguinte à contagem). Agora:
--   pedido = "Chegou" da equipe → conferência do painel → dia de entrega previsto às 09:00;
--   nota ligada a pedido = o que vier antes: a chegada do pedido ou o "Lançar";
--   pedido marcado "Não veio" não conta.
-- Medido nos últimos 60 dias: a hora quase não muda o resultado (145 → 144 trechos negativos).
-- Os negativos que ficam são estoque que subiu SEM nota nem pedido (produção da casa, compra no
-- mercado) ou contagem em outra unidade; a tela explica isso.
-- O resto é igual à 0296 (security definer + empresa + tem_permissao('contagem')).

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
security definer
set search_path to 'public'
as $function$
  with dia as (
    -- última contagem de cada dia, por produto (itens "precisa comprar?" não têm quantidade)
    select distinct on (ci.produto_id, c.data)
           ci.produto_id, c.criado_em, ci.qtd_estoque as qtd
    from contagem_itens ci
    join contagens c on c.id = ci.contagem_id
    where c.status = 'finalizada'
      and c.empresa_id = (select public.empresa_atual())
      and (select public.tem_permissao('contagem'))
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
    select ni.produto_id,
           -- Nota de pedido que a equipe já marcou como chegado: vale a chegada.
           least(nf.entrada_em, coalesce(pn.conf_colab_em, pn.conferido_em, nf.entrada_em)) as t,
           nf.id as nota_id, ni.qtd,
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
    left join pedidos pn on pn.id = nf.pedido_id
    where ni.destino is null
      and nf.empresa_id = (select public.empresa_atual())
      and nf.entrada_em >= (p_desde - 46)
      and coalesce(nf.situacao, '') <> 'cancelada'
  ),
  ped as (
    select pi.produto_id,
           -- mesmo dia de entrega de pedido_dia_entrega(), aqui num join (a função linha a linha era 4× mais lenta)
           coalesce(pe.conf_colab_em, pe.conferido_em,
                    (coalesce(pe.entrega_prevista, cf.prazo_entrega, pe.data + 1)::timestamp + time '09:00')
                      at time zone 'America/Sao_Paulo') as t,
           coalesce(pi.qtd_recebida, pi.qtd) as q
    from pedido_itens pi
    join pedidos pe on pe.id = pi.pedido_id
    left join cotacao_fornecedores cf on cf.cotacao_id = pe.cotacao_id and cf.fornecedor_id = pe.fornecedor_id
    where pe.criado_em >= (p_desde - 46)
      and pe.empresa_id = (select public.empresa_atual())
      and pe.criado_em::date <= pe.data + 2
      and pe.nao_veio_em is null
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

revoke all on function public.consumo_periodos(date) from public, anon;
grant execute on function public.consumo_periodos(date) to authenticated;

notify pgrst, 'reload schema';
