-- Aviso do Supabase (31/08): _migrations era a única tabela do schema public sem
-- RLS. Ela só é usada pelo scripts/migrate.mjs via conexão direta (dona da
-- tabela, não passa por RLS); pela API pública ninguém precisa enxergar.
alter table public._migrations enable row level security;
