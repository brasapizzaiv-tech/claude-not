-- Dados pessoais da equipe (SEC-04, fase B, lote 1) — PARTE 2: a sessão não
-- lê mais estas colunas na tabela colaboradores. Só aplicar DEPOIS do código
-- que lê pela visão colaboradores_dados (0294) estar no ar. O scripts/migrate.mjs
-- passa a reaplicar esta lista depois de cada rodada (ele confere que a 0295
-- foi aplicada).
-- Colunas pessoais fora da sessão na tabela (mesmo bloco do migrate.mjs).
do $$
declare secretas text[] := array[
  'token', 'pin', 'codigo',
  'cpf', 'rg', 'pis', 'ctps', 'cnh', 'cnh_categoria', 'cnh_validade', 'nascimento',
  'cep', 'endereco', 'endereco_numero', 'bairro', 'cidade', 'uf', 'telefone', 'telefone_emergencia',
  'nome_pai', 'nome_mae', 'genero', 'tipo_sanguineo', 'conjuge', 'filhos',
  'salario_base', 'valor_dia', 'valor_noite', 'valor_free', 'numero_folha'];
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'colaboradores' and column_name <> all (secretas);
  revoke select on public.colaboradores from authenticated;
  execute format('grant select (%s) on public.colaboradores to authenticated', cols);
end $$;
