-- Salão/PDV — Categorias do cardápio como objeto (ordem + disponibilidade).
create table if not exists public.pdv_categorias (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ordem      int  not null default 0,
  disponivel boolean not null default true
);

-- semeia com as categorias já usadas nos itens
insert into public.pdv_categorias (nome, ordem)
select categoria, (row_number() over (order by categoria))::int
from (select distinct categoria from public.pdv_itens where categoria is not null and categoria <> '') s
on conflict (nome) do nothing;

alter table public.pdv_categorias enable row level security;
drop policy if exists "pdv_categorias_all" on public.pdv_categorias;
create policy "pdv_categorias_all" on public.pdv_categorias for all to authenticated using (true) with check (true);
