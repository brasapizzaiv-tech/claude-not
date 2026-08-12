-- Validade por tipo de conservação + quantidade/unidade na etiqueta.
alter table public.produtos
  add column if not exists validade_congelado int,
  add column if not exists validade_resfriado int,
  add column if not exists validade_ambiente  int;

alter table public.etiquetas
  add column if not exists conservacao text,
  add column if not exists quantidade  numeric,
  add column if not exists unidade     text;

-- Atualiza a leitura pública do QR com os novos campos.
create or replace function public.etiqueta_por_id(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'numero', numero,
    'produto', produto_nome,
    'colaborador', colaborador_nome,
    'manipulado_em', manipulado_em,
    'validade', validade,
    'conservacao', conservacao,
    'quantidade', quantidade,
    'unidade', unidade
  ) into v from etiquetas where id = p_id;
  return v;
end;
$$;

grant execute on function public.etiqueta_por_id(uuid) to anon, authenticated;
