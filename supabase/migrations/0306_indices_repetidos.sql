-- SEC-19 (Onda 7), com o OK do Rafael em 11/11/2026: índices em dobro. Cada
-- tabela de configuração já tem o índice ÚNICO por empresa (_empresa_key); o
-- _empresa_idx comum só repete ele.
--
-- A `cotacao_itens_backup` NÃO sai: a auditoria a chamou de tabela velha, mas é
-- o "Desfazer" da cotação (salvarCotacaoItens guarda os 15 últimos estados).
drop index if exists public.balanca_status_empresa_idx;
drop index if exists public.delivery_config_empresa_idx;
drop index if exists public.impressao_config_empresa_idx;
