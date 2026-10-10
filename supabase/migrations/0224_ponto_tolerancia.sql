-- Tolerância do ponto nos relatórios, igual à do RHiD ("Horário Restaurante"):
--  - batida até 5 min antes/depois do horário não conta (nem atraso, nem extra);
--  - passou de 5 min, conta inteiro;
--  - se as extras (ou as faltas) somadas no dia passarem de 10 min, contam todas.
-- O prêmio assiduidade NÃO usa isso: lá todo minuto de atraso soma (regra do Rafael).
alter table public.assiduidade_config
  add column if not exists tolerancia_batida_min integer not null default 5,
  add column if not exists limite_diario_min integer not null default 10;
