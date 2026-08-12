-- Baixa da etiqueta pela leitura do QR (câmera), sem precisar de login.
-- SECURITY DEFINER: roda com permissão do dono, exposta ao anon com regras fixas.
create or replace function public.etiqueta_baixa_scan(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if p_status not in ('usada', 'descartada') then
    return jsonb_build_object('ok', false, 'erro', 'status invalido');
  end if;

  update etiquetas
     set status = p_status,
         baixa_em = now()
   where id = p_id
     and status = 'ativa';

  select jsonb_build_object(
    'ok', true,
    'numero', numero,
    'produto', produto_nome,
    'validade', validade,
    'conservacao', conservacao,
    'quantidade', quantidade,
    'unidade', unidade,
    'status', status,
    'baixa_em', baixa_em
  ) into v from etiquetas where id = p_id;

  if v is null then
    return jsonb_build_object('ok', false, 'erro', 'nao encontrada');
  end if;
  return v;
end;
$$;

grant execute on function public.etiqueta_baixa_scan(uuid, text) to anon, authenticated;
