-- Cliente respondeu "SAIR" no WhatsApp: marca o cadastro (pelos 8 últimos
-- dígitos do telefone, que batem com ou sem o 9 e o DDD) e devolve quantos
-- cadastros marcou. Usado pelo webhook.
create or replace function public.wpp_marcar_sair(p_fone text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fim text := right(regexp_replace(coalesce(p_fone, ''), '\D', '', 'g'), 8);
  v_n integer;
begin
  if length(v_fim) < 8 then return 0; end if;
  update clientes
     set wpp_sair_em = now(), aceita_promocoes = false, aceita_promocoes_em = now()
   where right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = v_fim
     and wpp_sair_em is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.wpp_marcar_sair(text) from public, anon, authenticated;
grant execute on function public.wpp_marcar_sair(text) to service_role;
