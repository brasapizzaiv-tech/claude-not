-- Contas que vieram de nota fiscal nunca ganhavam o "dia de lançamento"
-- (lancamento_em): o Lançar da nota gravava competência e vencimento, só.
-- Pergunta do Rafael em 05/10/2026. Daqui em diante o Lançar grava a data do
-- dia; o histórico recebe a data em que a linha foi criada (criado_em), que é
-- exatamente o momento em que a nota foi lançada.
update public.lancamentos
   set lancamento_em = (criado_em at time zone 'America/Sao_Paulo')::date
 where origem = 'nota' and lancamento_em is null and criado_em is not null;
