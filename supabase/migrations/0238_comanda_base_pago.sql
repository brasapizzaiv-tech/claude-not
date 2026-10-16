-- "Pagar parte" no caixa do salão (divide a comanda por pessoas ou por valor),
-- com os 10% escolhidos em cada pagamento. valor_pago guarda o DINHEIRO que
-- entrou (com ou sem serviço); base_pago guarda quanto do PREÇO já foi coberto.
-- O item (ou o buffet) quita quando base_pago chega no preço, e o serviço
-- cobrado da comanda é a diferença entre os dois.
alter table public.pdv_comanda_itens
  add column if not exists base_pago numeric not null default 0;
alter table public.pdv_comandas
  add column if not exists buffet_base_pago numeric not null default 0;

-- Antes não existia: o que já estava pago cobre o preço inteiro; pagamento
-- parcial antigo conta o que entrou, limitado ao preço.
update public.pdv_comanda_itens
   set base_pago = case when pago then round(qtd * preco_unit, 2)
                        else least(coalesce(valor_pago, 0), round(qtd * preco_unit, 2)) end
 where base_pago = 0 and (pago or coalesce(valor_pago, 0) > 0);

update public.pdv_comandas
   set buffet_base_pago = case when buffet_pago then coalesce(valor_buffet, 0)
                               else least(coalesce(buffet_valor_pago, 0), coalesce(valor_buffet, 0)) end
 where buffet_base_pago = 0 and (buffet_pago or coalesce(buffet_valor_pago, 0) > 0);
