-- CORTESIA E VALE-PRESENTE (pedido do Rafael, 14/10/2026)
-- Fecham a conta no caixa sem ser dinheiro entrando: a cortesia a casa paga
-- (aniversário, cliente da casa…), o vale-presente foi pago quando foi vendido.
-- O caixa grava o movimento com tipo próprio ('cortesia' / 'vale_presente'),
-- não 'venda' — assim fica fora do dinheiro do caixa, do faturamento e da nota
-- fiscal, e aparece no relatório Cortesias e vales com a observação (o motivo).

alter table public.formas_pagamento drop constraint if exists formas_pagamento_tipo_check;
alter table public.formas_pagamento add constraint formas_pagamento_tipo_check
  check (tipo in ('dinheiro', 'pix', 'pix_maquina', 'credito', 'debito', 'cartao', 'vale', 'cortesia', 'vale_presente', 'outro'));

insert into public.formas_pagamento (empresa_id, nome, tipo, no_caixa, no_pdv, no_delivery, no_app, no_fiado, ativo, ordem)
select '00000000-0000-4000-8000-000000000001', v.nome, v.tipo, true, true, false, false, false, true, v.ordem
  from (values ('Cortesia', 'cortesia', 90), ('Vale-presente', 'vale_presente', 91)) as v(nome, tipo, ordem)
 where not exists (
   select 1 from public.formas_pagamento f
    where f.empresa_id = '00000000-0000-4000-8000-000000000001' and f.tipo = v.tipo
 );

comment on column public.pdv_caixa_mov.tipo is
  'venda | suprimento | sangria | cortesia | vale_presente (estes dois fecham conta sem entrar dinheiro: fora do caixa e do faturamento)';
