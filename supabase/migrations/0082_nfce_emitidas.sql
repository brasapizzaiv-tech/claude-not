-- Notas fiscais (NFC-e/NF-e) emitidas pelo sistema via Focus NFe.
create table if not exists public.nfce_emitidas (
  id         uuid primary key default gen_random_uuid(),
  comanda_id uuid references public.pdv_comandas (id) on delete set null,
  modelo     text not null default 'nfce',      -- 'nfce' | 'nfe'
  ambiente   text not null,                     -- 'homologacao' | 'producao'
  ref        text not null,
  status     text,                              -- 'autorizado' | 'erro_autorizacao' | 'cancelado' ...
  numero     text,
  serie      text,
  chave      text,
  url_danfe  text,
  url_xml    text,
  mensagem   text,
  criado_em  timestamptz not null default now()
);

create index if not exists nfce_emitidas_comanda_idx on public.nfce_emitidas (comanda_id);
create index if not exists nfce_emitidas_ref_idx on public.nfce_emitidas (ref);

alter table public.nfce_emitidas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='nfce_emitidas' and policyname='nfce_all') then
    create policy "nfce_all" on public.nfce_emitidas for all to authenticated using (true) with check (true);
  end if;
end $$;
