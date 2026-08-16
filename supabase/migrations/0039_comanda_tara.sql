-- Comanda mostra peso, tara e valor. Nome do restaurante e tara padrão ficam
-- em pdv_config (chave/valor).
alter table public.pdv_comandas
  add column if not exists tara numeric not null default 0;
