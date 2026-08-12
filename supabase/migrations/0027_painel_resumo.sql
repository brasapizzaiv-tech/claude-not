-- Resumo do painel inicial: números do mês em uma única consulta.
create or replace function public.painel_resumo()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with
  ini as (select date_trunc('month', current_date)::date d),
  fim as (select (date_trunc('month', current_date) + interval '1 month')::date d),
  ant as (select (date_trunc('month', current_date) - interval '1 month')::date d),
  ult as (
    select id from contagens where status = 'finalizada'
    order by data desc, criado_em desc limit 1
  )
  select jsonb_build_object(
    'faturamento_mes', (
      select coalesce(sum(valor), 0) from notas_emitidas
      where status = 'Autorizado'
        and data_emissao >= (select d from ini)
        and data_emissao <  (select d from fim)),
    'faturamento_mes_ant', (
      select coalesce(sum(valor), 0) from notas_emitidas
      where status = 'Autorizado'
        and data_emissao >= (select d from ant)
        and data_emissao <  (select d from ini)),
    'notas_mes', (
      select count(*) from notas_emitidas
      where status = 'Autorizado'
        and data_emissao >= (select d from ini)
        and data_emissao <  (select d from fim)),
    'despesas_mes', (
      select coalesce(sum(valor), 0) from lancamentos
      where data >= (select d from ini) and data < (select d from fim)),
    'contas_aberto', (
      select coalesce(sum(valor), 0) from lancamentos where pago = false),
    'contas_vencidas', (
      select coalesce(sum(valor), 0) from lancamentos
      where pago = false and vencimento < current_date),
    'contas_vencer7', (
      select coalesce(sum(valor), 0) from lancamentos
      where pago = false and vencimento >= current_date
        and vencimento <= current_date + 7),
    'etiquetas_ativas', (
      select count(*) from etiquetas where status = 'ativa'),
    'etiquetas_vencendo', (
      select count(*) from etiquetas
      where status = 'ativa' and validade is not null
        and validade >= current_date and validade <= current_date + 2),
    'etiquetas_vencidas', (
      select count(*) from etiquetas
      where status = 'ativa' and validade is not null
        and validade < current_date),
    'estoque_tem_contagem', (select exists (select 1 from ult)),
    'estoque_valor', (
      select coalesce(sum(ci.qtd_estoque * coalesce(p.preco_referencia, 0)), 0)
      from contagem_itens ci
      join produtos p on p.id = ci.produto_id
      where ci.contagem_id = (select id from ult)),
    'fornecedores', (select count(*) from fornecedores where ativo),
    'produtos', (select count(*) from produtos where ativo),
    'colaboradores', (select count(*) from colaboradores where ativo)
  );
$$;

grant execute on function public.painel_resumo() to authenticated;
