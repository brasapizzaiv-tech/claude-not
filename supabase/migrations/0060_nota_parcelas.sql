-- Parcelas (duplicatas) da NF-e, lidas do bloco <cobr>/<dup> do XML. Uma nota
-- parcelada vira várias contas a pagar, cada uma com seu vencimento e valor.
create table if not exists public.nota_parcelas (
  id          uuid primary key default gen_random_uuid(),
  nota_id     uuid not null references public.notas_fiscais(id) on delete cascade,
  numero      text,
  vencimento  date,
  valor       numeric not null default 0,
  criado_em   timestamptz not null default now()
);

create index if not exists nota_parcelas_nota_idx on public.nota_parcelas (nota_id);

alter table public.nota_parcelas enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'nota_parcelas' and policyname = 'np_all'
  ) then
    create policy "np_all" on public.nota_parcelas
      for all to authenticated using (true) with check (true);
  end if;
end $$;
