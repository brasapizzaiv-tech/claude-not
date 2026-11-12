-- DEL-05 (Onda 5, delivery próprio): 2.441 de 3.272 telefones de cliente
-- estão gravados formatados, "(51) 99999-9999", e as buscas procuravam só os
-- dígitos — o app criava cliente duplicado (cashback, promoções e aniversário
-- iam pro duplicado) e o "Novo pedido" não achava ninguém com mais de 5 dígitos.
-- Coluna só com os números, calculada pelo banco, com índice. A mesma regra do
-- src/lib/telefone.ts (foneDigitos): com 12 ou 13 números começando em 55,
-- tira o 55 do país; senão, os 11 últimos. As buscas passam a usar ela.
alter table public.clientes
  add column if not exists telefone_digitos text
  generated always as (nullif(
    case
      when length(regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) in (12, 13)
       and left(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 2) = '55'
        then substr(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 3)
      else right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 11)
    end, '')) stored;

create index if not exists clientes_telefone_digitos_idx
  on public.clientes (empresa_id, telefone_digitos);

notify pgrst, 'reload schema';
