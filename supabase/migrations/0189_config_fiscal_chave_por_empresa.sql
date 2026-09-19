-- Conserto de um erro meu na 0188.
--
-- Eu quis tirar a regra "o nome do ajuste é único no banco inteiro" e pus um
-- `drop constraint config_fiscal_chave_key`. Esse nome não existia: em
-- `config_fiscal` o nome do ajuste é a CHAVE PRIMÁRIA (`config_fiscal_pkey`).
-- O comando não deu erro — tinha `if exists` — e simplesmente não fez nada.
-- Resultado: ficou a chave primária antiga (que ainda impediria o segundo
-- restaurante de ter o interruptor dele) mais um índice novo por cima.
--
-- Aqui a chave primária passa a ser o par empresa + nome, que é o que ela
-- devia ser desde o começo. Ninguém aponta pra esta tabela, então trocar a
-- chave não arrasta nada junto.
alter table public.config_fiscal drop constraint config_fiscal_pkey;
drop index if exists public.config_fiscal_empresa_chave_key;
alter table public.config_fiscal
  add constraint config_fiscal_pkey primary key (empresa_id, chave);
