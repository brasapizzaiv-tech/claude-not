-- Troco de abertura do caixa contado nota por nota (pedido do Rafael,
-- 10/11/2026). Antes só o fechamento tinha a contagem por nota; a abertura
-- guardava só o total, e o Cofre pedia de novo quais notas saíram.
-- Formato igual ao resumo.notas do fechamento: { "<centavos>": quantidade }.
alter table public.pdv_caixas add column if not exists abertura_notas jsonb;
