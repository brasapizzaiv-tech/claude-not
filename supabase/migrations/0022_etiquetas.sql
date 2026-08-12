-- Módulo Etiquetas (manipulação de insumos da cozinha).

-- Validade padrão do produto (dias após a manipulação).
alter table public.produtos
  add column if not exists validade_dias int;

create sequence if not exists public.etiqueta_numero_seq;

create table if not exists public.etiquetas (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint not null default nextval('public.etiqueta_numero_seq'),
  produto_id       uuid references public.produtos (id) on delete set null,
  produto_nome     text not null,
  colaborador_nome text,
  manipulado_em    timestamptz not null default now(),
  validade         date,
  criado_em        timestamptz not null default now()
);

alter table public.etiquetas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='etiquetas' and policyname='et_all') then
    create policy "et_all" on public.etiquetas for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Leitura pública de UMA etiqueta (para o QR code) — sem login, via id.
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
    'validade', validade
  ) into v from etiquetas where id = p_id;
  return v;
end;
$$;

grant execute on function public.etiqueta_por_id(uuid) to anon, authenticated;
