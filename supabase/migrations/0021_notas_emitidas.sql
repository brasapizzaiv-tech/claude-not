-- Notas fiscais EMITIDAS pela Brasa (vendas / NFC-e). Para comparar com o faturamento.
create table if not exists public.notas_emitidas (
  id            uuid primary key default gen_random_uuid(),
  chave         text unique,
  numero        text,
  serie         text,
  modelo        text,
  status        text,
  valor         numeric not null default 0,
  data_emissao  date,
  consumidor    text,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_notas_emitidas_data on public.notas_emitidas (data_emissao);

alter table public.notas_emitidas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='notas_emitidas' and policyname='ne_all') then
    create policy "ne_all" on public.notas_emitidas for all to authenticated using (true) with check (true);
  end if;
end $$;
