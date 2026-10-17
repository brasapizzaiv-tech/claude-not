-- Forma de pagamento que exige um código (ex.: cupom do Juntos, o programa de
-- recompensas do Sicredi: o associado troca pontos por cupom de desconto e o
-- Sicredi repassa o valor). `pede_codigo` é o texto do campo que o caixa tem
-- que preencher (ex.: "Código do cupom"); vazio = não pede nada. O código vai
-- na observação do lançamento do caixa.
alter table public.formas_pagamento
  add column if not exists pede_codigo text;

-- Juntos Sicredi: conta como venda (o Sicredi repassa), no caixa do salão, no
-- PDV e no recebimento do delivery.
insert into public.formas_pagamento (empresa_id, nome, tipo, no_caixa, no_pdv, no_delivery, no_app, no_fiado, ordem, pede_codigo)
select e.id, 'Juntos Sicredi', 'outro', true, true, true, false, false, 8, 'Código do cupom'
  from public.empresas e
 where e.id = '00000000-0000-4000-8000-000000000001'
   and not exists (select 1 from public.formas_pagamento f where f.empresa_id = e.id and lower(f.nome) = 'juntos sicredi');
