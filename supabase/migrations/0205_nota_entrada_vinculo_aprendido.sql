-- Pedido do Rafael (06/10/2026), depois do aviso falso na contagem de 05/10:
-- a nota da Deale de 01/10 estava em resumo (sem itens) e, mesmo depois de
-- manifestada, o queijo veio sem ligação com o produto — a ligação é manual,
-- item por item, e o sistema não lembrava a da semana anterior.
--
-- 1) VÍNCULO APRENDIDO: item novo com a mesma descrição e o mesmo fornecedor
--    (CNPJ) de um item já ligado antes entra ligado sozinho (e herda o fator).
--    Gatilho no insert — vale pra SEFAZ, XML e qualquer outro caminho.
-- 2) ENTRADA: a contagem passa a somar "o que chegou" pela data em que a nota
--    DEU ENTRADA (entrada_em), não pela emissão. A Deale emite numa semana e
--    entrega na outra. O Lançar grava o momento; a tela da nota deixa corrigir.
--    Nota sem entrada (pendente) não conta como chegada.

-- ---------------------------------------------------------------- 1) vínculo
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
  if new.produto_id is not null or new.descricao is null or btrim(new.descricao) = '' then
    return new;
  end if;
  select emit_cnpj into v_cnpj from notas_fiscais where id = new.nota_id;
  if v_cnpj is null then return new; end if;

  -- A ligação mais recente do mesmo texto no mesmo fornecedor.
  select n2.produto_id, n2.fator
    into v_prod, v_fator
    from nota_itens n2
    join notas_fiscais f2 on f2.id = n2.nota_id
   where f2.emit_cnpj = v_cnpj
     and n2.produto_id is not null
     and coalesce(f2.situacao, '') <> 'cancelada'
     and lower(btrim(n2.descricao)) = lower(btrim(new.descricao))
   order by f2.data_emissao desc nulls last, f2.criado_em desc
   limit 1;

  if v_prod is not null then
    new.produto_id := v_prod;
    if new.fator is null and v_fator is not null then
      new.fator := v_fator;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nota_itens_vinculo_aprendido on public.nota_itens;
create trigger nota_itens_vinculo_aprendido
  before insert on public.nota_itens
  for each row execute function public.nota_item_vinculo_aprendido();

create index if not exists nota_itens_descricao_vinculada_idx
  on public.nota_itens (lower(btrim(descricao)))
  where produto_id is not null;

-- Itens já no sistema sem ligação, onde o mesmo texto do mesmo fornecedor já
-- foi ligado: notas pendentes (qualquer data) e lançadas desde a última
-- contagem (28/09). Mais antigas ficam como estão, pra não mexer em CMV fechado.
with alvo as (
  select distinct on (ni.id) ni.id, n2.produto_id, n2.fator
    from nota_itens ni
    join notas_fiscais f1 on f1.id = ni.nota_id
    join notas_fiscais f2 on f2.emit_cnpj = f1.emit_cnpj
                         and coalesce(f2.situacao, '') <> 'cancelada'
    join nota_itens n2 on n2.nota_id = f2.id
                      and n2.produto_id is not null
                      and lower(btrim(n2.descricao)) = lower(btrim(ni.descricao))
   where ni.produto_id is null
     and coalesce(f1.situacao, '') <> 'cancelada'
     and (coalesce(f1.situacao, '') <> 'lancada' or f1.data_emissao >= date '2026-09-28')
   order by ni.id, f2.data_emissao desc nulls last, f2.criado_em desc
)
update nota_itens ni
   set produto_id = alvo.produto_id,
       fator = coalesce(ni.fator, alvo.fator)
  from alvo
 where alvo.id = ni.id;

-- ---------------------------------------------------------------- 2) entrada
alter table public.notas_fiscais
  add column if not exists entrada_em timestamptz;
comment on column public.notas_fiscais.entrada_em is
  'Quando a mercadoria deu entrada. O Lançar grava o momento (se ainda vazio); a tela da nota deixa corrigir. A contagem soma "o que chegou" por esta data.';

-- Histórico: a conta a pagar foi criada no instante do Lançar.
update public.notas_fiscais nf
   set entrada_em = l.em
  from (select nota_id, min(criado_em) as em
          from public.lancamentos
         where nota_id is not null
         group by nota_id) l
 where l.nota_id = nf.id
   and nf.entrada_em is null;

-- Nota marcada como lançada mas sem conta (limpezas antigas): vale a data em
-- que a nota entrou no sistema.
update public.notas_fiscais
   set entrada_em = criado_em
 where situacao = 'lancada'
   and entrada_em is null;

create index if not exists notas_fiscais_entrada_em_idx
  on public.notas_fiscais (entrada_em)
  where entrada_em is not null;

-- Conferência da contagem: notas entram pela ENTRADA (depois da contagem
-- anterior), não mais pela emissão. O resto é igual à 0138.
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
  ), '[]'::jsonb);
end;
$$;
