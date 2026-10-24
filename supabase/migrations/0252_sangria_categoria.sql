-- Sangria com categoria (Rafael, 23/10/2026): pagamento feito com dinheiro do
-- caixa (motoboy, faxina, garçom da associação…) vira DESPESA paga no
-- financeiro. Sem categoria continua só retirada (cofre, troco).
alter table public.pdv_caixa_mov
  add column if not exists lancamento_id uuid references public.lancamentos (id) on delete set null;
create index if not exists pdv_caixa_mov_lancamento_idx on public.pdv_caixa_mov (lancamento_id) where lancamento_id is not null;
