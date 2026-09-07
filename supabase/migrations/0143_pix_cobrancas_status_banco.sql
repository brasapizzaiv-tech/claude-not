-- Diagnóstico das cobranças Pix: o que o banco respondeu na última consulta e
-- quanto ele diz que recebeu (o "pago" agora exige o Pix listado, não só o status).
alter table public.pix_cobrancas
  add column if not exists status_banco text,
  add column if not exists valor_recebido numeric(12,2);
