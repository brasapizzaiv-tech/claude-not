-- "Pix na máquina" também no PDV e no "Receber" do delivery/retirada: o cliente
-- que vem retirar decide pagar no Pix na hora (pedido do Rafael, 12/10/2026).
-- As duas telas agora passam no pinpad quando o agente TEF está no PC.
update public.formas_pagamento
   set no_pdv = true, no_delivery = true
 where empresa_id = '00000000-0000-4000-8000-000000000001' and tipo = 'pix_maquina';
