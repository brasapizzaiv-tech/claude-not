-- Item da nota que NÃO é da casa (Rafael, 19/10/2026): veio junto na nota do
-- fornecedor, mas foi comprado pra Ana e o Rafa (sócios) ou pra um
-- funcionário. Não entra no estoque, no CMV, no preço de referência nem na
-- conferência. No financeiro vai pra "Consumo dos sócios" ou "Outras
-- despesas com pessoal"; o do funcionário também vira Compra interna dele.
alter table public.nota_itens
  add column if not exists destino text check (destino in ('socios', 'funcionario')),
  add column if not exists destino_colaborador_id uuid references public.colaboradores (id) on delete set null,
  add column if not exists destino_retirada_id bigint references public.retiradas (id) on delete set null;

-- "Chegou depois" da contagem: o item pessoal não chegou pro estoque.
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
  ), '[]'::jsonb);
end;
$function$;
