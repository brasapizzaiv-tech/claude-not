-- Registra quem lançou cada item e agrupa os itens do mesmo pedido
-- (lançamento), para o histórico geral no app do garçom.
alter table public.pdv_comanda_itens
  add column if not exists criado_por uuid,
  add column if not exists lancamento_id uuid;

create index if not exists idx_pdv_comanda_itens_criado_em
  on public.pdv_comanda_itens (criado_em desc);
create index if not exists idx_pdv_comanda_itens_lancamento
  on public.pdv_comanda_itens (lancamento_id);
