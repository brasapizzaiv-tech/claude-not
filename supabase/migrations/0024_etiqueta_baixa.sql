-- Baixa da etiqueta (controle de validade dos insumos).
alter table public.etiquetas
  add column if not exists status text not null default 'ativa'
    check (status in ('ativa', 'usada', 'descartada')),
  add column if not exists baixa_em timestamptz;

create index if not exists idx_etiquetas_status on public.etiquetas (status, validade);

-- RPC pública do QR com o status.
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
    'unidade', unidade,
    'status', status
  ) into v from etiquetas where id = p_id;
  return v;
end;
$$;

grant execute on function public.etiqueta_por_id(uuid) to anon, authenticated;
