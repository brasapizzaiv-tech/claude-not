-- FATURAMENTO E NOTAS DE VENDA DO PRÓPRIO SISTEMA, POR DIA
--
-- Até 31/08/2026 o faturamento vinha da planilha (faturamento_dias) e as notas
-- de venda do relatório importado do sistema antigo (notas_emitidas, série 10).
-- Desde 07/09 as duas coisas nascem aqui: as vendas no caixa (pdv_caixa_mov
-- tipo 'venda') e as NFC-e emitidas pela Focus (nfce_emitidas, série 11). As
-- telas de Notas × Faturamento, DRE e CMV não liam nenhuma das duas.
--
-- Somar no banco (e não trazer as linhas): um mês de caixa passa de 2 mil
-- vendas, e a API corta em 1000 linhas por consulta.
--
-- security invoker: roda com a permissão de quem chama, então o RLS de cada
-- tabela continua valendo (cada empresa só soma o que é dela).

-- Vendas do caixa por dia. Almoço = antes das 16h; noite = 16h em diante.
create or replace function public.faturamento_sistema_dias(p_de date, p_ate date)
returns table (dia date, almoco numeric, noite numeric, vendas integer)
language sql
stable
security invoker
set search_path = public
as $$
  select (m.criado_em at time zone 'America/Sao_Paulo')::date as dia,
         coalesce(sum(m.valor) filter (where extract(hour from m.criado_em at time zone 'America/Sao_Paulo') < 16), 0)::numeric(14,2),
         coalesce(sum(m.valor) filter (where extract(hour from m.criado_em at time zone 'America/Sao_Paulo') >= 16), 0)::numeric(14,2),
         count(*)::int
    from pdv_caixa_mov m
   where m.tipo = 'venda'
     and m.criado_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
     and m.criado_em <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
   group by 1
$$;

-- Notas de venda autorizadas por dia: as importadas (sistema antigo) e as do
-- sistema (Focus, só produção). Cada linha diz de onde veio.
create or replace function public.notas_venda_dias(p_de date, p_ate date)
returns table (dia date, fonte text, notas integer, valor numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select n.data_emissao::date, 'importada', count(*)::int, coalesce(sum(n.valor), 0)::numeric(14,2)
    from notas_emitidas n
   where n.status = 'Autorizado' and n.data_emissao between p_de and p_ate
   group by 1
  union all
  select (e.criado_em at time zone 'America/Sao_Paulo')::date, 'sistema', count(*)::int, coalesce(sum(e.valor), 0)::numeric(14,2)
    from nfce_emitidas e
   where e.status = 'autorizado' and e.ambiente = 'producao'
     and e.criado_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
     and e.criado_em <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
   group by 1
$$;

grant execute on function public.faturamento_sistema_dias(date, date) to authenticated, service_role;
grant execute on function public.notas_venda_dias(date, date) to authenticated, service_role;
