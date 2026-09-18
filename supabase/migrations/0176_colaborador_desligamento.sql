-- Desligamento de colaborador: em vez de "remover", a pessoa é DESLIGADA com
-- data e motivo (demissão, pediu conta, parou de trabalhar). Fica no cadastro
-- (histórico de pagamentos, folgas, compras) mas some das listas e perde o
-- acesso ao app: o link pessoal (token) e o PIN são apagados na hora.
alter table public.colaboradores add column if not exists desligado_em     date;
alter table public.colaboradores add column if not exists desligado_motivo text;
