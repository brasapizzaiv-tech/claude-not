-- Código de entrada dos apps Motelli (Equipe e Entregador) vale UMA vez e por
-- 7 dias (auditoria SEC-05, 09/11/2026). Antes cada pessoa tinha um código fixo
-- de 6 números pra sempre: 61 códigos válidos em 1 milhão, e quem acertava um
-- recebia o link pessoal. Agora só tem código válido quem está pra instalar.
-- O formato continua 6 números (os apps das lojas só aceitam isso).
-- Os códigos de hoje ganham 7 dias a partir de agora; quem precisar depois
-- recebe um novo no painel ("Gerar código").

alter table public.colaboradores add column if not exists codigo_ate timestamptz;
alter table public.entregadores add column if not exists codigo_ate timestamptz;

update public.colaboradores set codigo_ate = now() + interval '7 days' where codigo is not null and codigo_ate is null;
update public.entregadores set codigo_ate = now() + interval '7 days' where codigo is not null and codigo_ate is null;

alter table public.colaboradores alter column codigo_ate set default now() + interval '7 days';
alter table public.entregadores alter column codigo_ate set default now() + interval '7 days';
