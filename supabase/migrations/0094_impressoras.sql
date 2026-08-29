-- Impressoras/estações (suporta várias — hoje 1, no futuro até 4 ou mais).
-- Cada etiqueta é enviada para uma impressora; a Estação daquele PC imprime só
-- o que for da impressora dela.
create table if not exists public.impressoras (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.etiquetas
  add column if not exists impressora_id uuid references public.impressoras (id) on delete set null;

alter table public.impressoras enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='impressoras' and policyname='impressoras_all') then
    create policy impressoras_all on public.impressoras for all to authenticated using (true) with check (true);
  end if;
end $$;

-- começa com uma impressora padrão (a Elgin que já chegou)
insert into public.impressoras (nome)
select 'Etiquetas'
where not exists (select 1 from public.impressoras);
