-- Correção: row_count é inteiro (não boolean).
create or replace function public.colaborador_definir_pin(p_token text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update colaboradores set pin = p_pin
   where token = p_token and ativo and pin is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0);
end; $$;

grant execute on function public.colaborador_definir_pin(text, text) to anon, authenticated;
