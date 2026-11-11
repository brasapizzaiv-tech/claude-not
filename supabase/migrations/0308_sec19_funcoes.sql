-- SEC-19 (Onda 7, auditoria 11/11/2026): duas funções que aceitavam mais do que deviam.
--
-- 1) pdv_reiniciar_numeracao: qualquer login (até quem só faz contagem) podia
--    voltar a numeração automática das comandas. Agora só quem mexe no caixa
--    (salão ou PDV; o dono sempre). Quem chama é o "Abrir caixa".
create or replace function public.pdv_reiniciar_numeracao()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.exigir_logado();
  if not (public.tem_permissao('salao') or public.tem_permissao('pdv')) then
    raise exception 'sem_permissao' using errcode = '42501', hint = 'Só quem mexe no caixa reinicia a numeração.';
  end if;
  perform setval(
    'public.pdv_comandas_numero_seq',
    coalesce((select nullif(valor, '')::bigint from public.pdv_config
               where chave = 'numero_inicial_auto' and empresa_id = public.empresa_atual() limit 1), 500),
    false);
end;
$function$;

revoke all on function public.pdv_reiniciar_numeracao() from public, anon;
grant execute on function public.pdv_reiniciar_numeracao() to authenticated;

-- 2) cotar_fornecedor_remover_item (link público do fornecedor): com a cotação
--    fechada ou o prazo vencido ainda apagava o produto da lista do fornecedor
--    (fornecedor_produto), mesmo quando não havia preço pra travar. Agora
--    recusa antes de apagar qualquer coisa, igual à trava do 0247.
create or replace function public.cotar_fornecedor_remover_item(p_token text, p_produto_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cf record;
  v_c record;
begin
  select cf.cotacao_id, cf.fornecedor_id
    into v_cf
  from cotacao_fornecedores cf
  where cf.token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Link inválido.');
  end if;

  select status, respostas_ate into v_c from cotacoes where id = v_cf.cotacao_id;
  if v_c.status = 'fechada' or (v_c.respostas_ate is not null and v_c.respostas_ate <= now()) then
    return jsonb_build_object('ok', false, 'erro', 'O prazo desta cotação terminou.');
  end if;

  delete from fornecedor_produto
  where fornecedor_id = v_cf.fornecedor_id and produto_id = p_produto_id;
  delete from cotacao_precos
  where cotacao_id = v_cf.cotacao_id
    and fornecedor_id = v_cf.fornecedor_id
    and produto_id = p_produto_id;

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.cotar_fornecedor_remover_item(text, uuid) from public;
grant execute on function public.cotar_fornecedor_remover_item(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
