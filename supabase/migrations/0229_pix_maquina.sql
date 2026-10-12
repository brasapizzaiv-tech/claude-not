-- PIX NA MAQUININHA (TEF)
-- Em 12/10/2026 a Elgin liberou o Pix Sicoob no pinpad (teste real de R$ 1,00
-- aprovado, NSU 809292). Vira forma de pagamento do caixa: o QR aparece na tela
-- do pinpad, o cliente paga e entra como pagamento da conta, igual ao cartão.
-- O "Pix" de sempre (QR do Sicoob na tela) continua existindo.

alter table public.formas_pagamento drop constraint if exists formas_pagamento_tipo_check;
alter table public.formas_pagamento add constraint formas_pagamento_tipo_check
  check (tipo in ('dinheiro', 'pix', 'pix_maquina', 'credito', 'debito', 'cartao', 'vale', 'outro'));

insert into public.formas_pagamento (empresa_id, nome, tipo, no_caixa, no_pdv, no_delivery, no_app, no_fiado, ativo, ordem)
select '00000000-0000-4000-8000-000000000001', 'Pix na máquina', 'pix_maquina', true, false, false, false, false, true, 3
where not exists (
  select 1 from public.formas_pagamento
  where empresa_id = '00000000-0000-4000-8000-000000000001' and tipo = 'pix_maquina'
);

-- Abre espaço: cartões e vale descem uma posição.
update public.formas_pagamento set ordem = ordem + 1
 where empresa_id = '00000000-0000-4000-8000-000000000001'
   and tipo in ('credito', 'debito', 'cartao', 'vale', 'outro')
   and ordem >= 3;
