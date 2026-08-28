-- Código do cartão físico (rodízio) associado à comanda, para achar pela
-- leitura do cartão (o número interno da comanda é gerado automático e não
-- pode receber o número do cartão).
alter table public.pdv_comandas
  add column if not exists cartao text;

create index if not exists idx_pdv_comandas_cartao
  on public.pdv_comandas (cartao)
  where cartao is not null;
