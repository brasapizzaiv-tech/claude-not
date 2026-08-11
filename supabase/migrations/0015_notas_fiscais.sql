-- Módulo 3 — Notas Fiscais (NF-e). Motor: importar XML, cruzar com pedido, lançar.

create table if not exists public.notas_fiscais (
  id            uuid primary key default gen_random_uuid(),
  chave         text unique not null,
  numero        text,
  serie         text,
  modelo        text,
  emit_cnpj     text,
  emit_nome     text,
  dest_cnpj     text,
  valor         numeric not null default 0,
  data_emissao  date,
  vencimento    date,
  fornecedor_id uuid references public.fornecedores (id) on delete set null,
  pedido_id     uuid references public.pedidos (id) on delete set null,
  status        text not null default 'importada'
                check (status in ('importada','conciliada')),
  criado_em     timestamptz not null default now()
);

create table if not exists public.nota_itens (
  id          uuid primary key default gen_random_uuid(),
  nota_id     uuid not null references public.notas_fiscais (id) on delete cascade,
  cprod       text,
  descricao   text,
  ncm         text,
  ean         text,
  unidade     text,
  qtd         numeric not null default 0,
  valor_unit  numeric,
  valor_total numeric
);

-- Liga o lançamento financeiro à nota que o originou.
alter table public.lancamentos
  add column if not exists nota_id uuid references public.notas_fiscais (id) on delete set null;

alter table public.lancamentos drop constraint if exists lancamentos_origem_check;
alter table public.lancamentos
  add constraint lancamentos_origem_check check (origem in ('manual','pedido','nota'));

-- RLS
alter table public.notas_fiscais enable row level security;
alter table public.nota_itens enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='notas_fiscais' and policyname='nf_all') then
    create policy "nf_all" on public.notas_fiscais for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='nota_itens' and policyname='ni_all') then
    create policy "ni_all" on public.nota_itens for all to authenticated using (true) with check (true);
  end if;
end $$;
