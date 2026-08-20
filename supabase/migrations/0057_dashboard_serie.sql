-- Série de 6 meses do dashboard, agregada NO BANCO (evita o limite de 1000
-- linhas do PostgREST ao somar milhares de notas linha a linha).
create or replace function public.dashboard_serie_6meses()
returns table (ym text, fiscal numeric, receita numeric, despesa numeric)
language sql
stable
as $$
  with meses as (
    select to_char(
             date_trunc('month', current_date) - (i || ' month')::interval,
             'YYYY-MM'
           ) as ym
    from generate_series(0, 5) as i
  ),
  ini as (
    select (date_trunc('month', current_date) - interval '5 month')::date as d
  ),
  fisc as (
    select to_char(data_emissao, 'YYYY-MM') as ym, sum(valor) as v
    from public.notas_emitidas, ini
    where status = 'Autorizado' and data_emissao >= ini.d
    group by 1
  ),
  rec as (
    select to_char(l.data, 'YYYY-MM') as ym, sum(l.valor) as v
    from public.lancamentos l
    join public.dre_categorias d on d.id = l.categoria_id, ini
    where d.tipo = 'receita' and l.data >= ini.d
    group by 1
  ),
  desp as (
    select to_char(l.data, 'YYYY-MM') as ym, sum(l.valor) as v
    from public.lancamentos l
    join public.dre_categorias d on d.id = l.categoria_id, ini
    where d.tipo not in ('receita', 'nao_operacional') and l.data >= ini.d
    group by 1
  )
  select m.ym,
         coalesce(fisc.v, 0),
         coalesce(rec.v, 0),
         coalesce(desp.v, 0)
  from meses m
  left join fisc on fisc.ym = m.ym
  left join rec on rec.ym = m.ym
  left join desp on desp.ym = m.ym
  order by m.ym;
$$;

grant execute on function public.dashboard_serie_6meses() to authenticated, anon;
