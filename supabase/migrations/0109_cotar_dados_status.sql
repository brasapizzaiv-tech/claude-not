-- O link do fornecedor passa a saber se ele JÁ ENVIOU (status + quando),
-- pra mostrar o aviso "você já enviou" ao reabrir a página.
create or replace function public.cotar_fornecedor_status(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('status', cf.status, 'respondido_em', cf.respondido_em)
  from cotacao_fornecedores cf
  where cf.token = p_token;
$$;

grant execute on function public.cotar_fornecedor_status(text) to anon, authenticated;
