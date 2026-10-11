-- FREE DE QUEM É CARTEIRA ASSINADA (Semana e 10%)
-- CLT não ganha diária (é pago pela folha). Mas quando trabalha num dia FORA da
-- escala dele (ex.: Selia e Luana D., seg a sex, fazendo um sábado), esse dia é
-- um "free" e é pago à parte, por este valor. Vazio = não paga free.
alter table public.colaboradores add column if not exists valor_free numeric(10,2);
