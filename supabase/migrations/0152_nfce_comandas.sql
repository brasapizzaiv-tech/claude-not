-- Uma NFC-e pode cobrir VÁRIAS comandas pagas juntas no caixa.
alter table public.nfce_emitidas add column if not exists comanda_ids uuid[];
create index if not exists nfce_emitidas_comanda_ids_idx on public.nfce_emitidas using gin (comanda_ids);
