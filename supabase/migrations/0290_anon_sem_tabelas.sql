-- Segunda camada no banco (auditoria SEC-15, Onda 3).
-- Antes: o papel anônimo (a chave pública que vai no navegador) tinha
-- SELECT/INSERT/UPDATE/DELETE em todas as tabelas do public. Quem segurava era
-- só o RLS: uma tabela criada sem "enable row level security" virava CRUD
-- público na hora.
-- Conferido em 10/11/2026: a única policy pro anônimo é a de leitura de
-- "empresas" (ativas); nenhuma tabela está sem RLS. Então tirar as permissões
-- do anon não muda nada do que funciona hoje — o que é público (cotação,
-- contagem, app da equipe, entregador, folga, pedir) passa por funções com
-- token, que continuam como estão.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.empresas to anon;

-- Tabela e sequência novas também nascem sem nada pro anon (a 0208 tinha
-- deixado o padrão dando tudo).
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
