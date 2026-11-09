-- Instaladores dos agentes (impressão, balança, pinpad) pra baixar direto no PC
-- do restaurante, pela Central de Impressões → Downloads (pedido do Rafael,
-- 09/11/2026). Bucket PRIVADO e sem policy: só o servidor (chave administrativa)
-- lê, e entrega um link que vale 10 minutos pra quem tem acesso à Central.
-- O instalador não leva o token: ele é pedido na instalação.
insert into storage.buckets (id, name, public)
values ('instaladores', 'instaladores', false)
on conflict (id) do nothing;
