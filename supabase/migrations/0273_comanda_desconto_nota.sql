-- Desconto que sai na nota fiscal (NFC-e). O caixa e o PDV gravam aqui o desconto
-- dado no recebimento (sem os 10%): desconto digitado, 5% do dinheiro, desconto
-- de funcionário. A nota reparte esse valor entre os itens e o total dela bate
-- com o que o cliente pagou. Antes a nota saía sempre com o preço cheio.
alter table public.pdv_comandas
  add column if not exists desconto_nota numeric(12,2) not null default 0
  check (desconto_nota >= 0);
