-- Salão/PDV — Complementos genéricos por item (marmitas, e futuramente outros):
-- grupos (ex.: "Adicionais", "Escolha a carne") com mín/máx, e opções com preço.
create table if not exists public.pdv_item_grupos (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references public.pdv_itens (id) on delete cascade,
  nome             text not null,
  min              int  not null default 0,
  max              int  not null default 1,
  permite_repetir  boolean not null default false,
  ordem            int  not null default 0
);

create table if not exists public.pdv_item_opcoes (
  id        uuid primary key default gen_random_uuid(),
  grupo_id  uuid not null references public.pdv_item_grupos (id) on delete cascade,
  nome      text not null,
  preco     numeric not null default 0,
  ordem     int  not null default 0,
  ativo     boolean not null default true
);

create index if not exists idx_pdv_item_grupos_item on public.pdv_item_grupos (item_id);
create index if not exists idx_pdv_item_opcoes_grupo on public.pdv_item_opcoes (grupo_id);

do $$
declare t text;
begin
  foreach t in array array['pdv_item_grupos','pdv_item_opcoes'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      drop policy if exists "pdv_compl_all" on public.%I;
      create policy "pdv_compl_all" on public.%I for all to authenticated using (true) with check (true);
    $p$, t, t);
  end loop;
end $$;
