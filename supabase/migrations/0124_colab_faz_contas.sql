-- App do colaborador: permissão "Contas a pagar" (ver boletos abertos e dar
-- baixa pelo celular) — pra quem tem função gerencial, ex.: a Ana.
alter table public.colaboradores add column if not exists faz_contas boolean not null default false;
