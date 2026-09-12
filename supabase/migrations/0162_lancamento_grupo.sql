-- Um pagamento só que se divide em várias categorias (fatura do cartão, por
-- exemplo: mercado + combustível + manutenção). As linhas ficam amarradas por
-- grupo_id pra conciliação tratar tudo como UM pagamento.
alter table public.lancamentos add column if not exists grupo_id uuid;
create index if not exists lancamentos_grupo on public.lancamentos (grupo_id) where grupo_id is not null;
