-- Referência pra conferir a contagem: pra cada produto, quanto tinha na ÚLTIMA
-- contagem finalizada e quanto CHEGOU (pedidos recebidos/conferidos) desde
-- então. Se o contador digitar mais que "tinha + chegou", a tela pede pra
-- contar de novo (erro humano comum: digitar 16 quando só podia ter 15).
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
             'comprado', coalesce((
               select sum(coalesce(pi.qtd_recebida, pi.qtd))
               from pedido_itens pi
               join pedidos p on p.id = pi.pedido_id
               where pi.produto_id = u.produto_id
                 and p.status in ('recebido', 'conferido')
                 and coalesce(p.conferido_em, p.criado_em) > u.criado_em
                 and coalesce(p.conferido_em, p.criado_em) <= now()
             ), 0)
           ))
    from (
      -- última contagem FINALIZADA (antes desta) em que o produto aparece
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

-- Versão pública (app do contador, pelo token do link).
create or replace function public.contar_referencia(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cid uuid;
begin
  select cl.contagem_id into v_cid from contagem_links cl where cl.token = p_token;
  if v_cid is null then return '[]'::jsonb; end if;
  return contagem_referencia(v_cid);
end;
$$;

grant execute on function public.contagem_referencia(uuid) to authenticated;
grant execute on function public.contar_referencia(text) to anon, authenticated;
