-- A partir de 30/10/2026 a Supabase deixa de dar permissão automática nas
-- tabelas novas do schema public pros papéis anon/authenticated/service_role
-- (aviso por e-mail em 10/2026). Esta migration deixa isso explícito: as
-- tabelas de hoje e as que vierem (default privileges do postgres, que é quem
-- roda as migrations). Não abre dado nenhum: o RLS continua decidindo.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select, update on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant usage, select, update on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
