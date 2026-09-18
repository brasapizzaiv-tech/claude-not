-- As listas reais da Brasa (FC-01 a FC-08) vêm divididas em blocos: "ANTES DE
-- COMEÇAR", "PREPARO", "MONTAGEM DO BUFFET", "CONFERÊNCIA FINAL", "SEMANAL"...
-- O item ganha a seção pra tela do celular mostrar esses blocos em vez de uma
-- lista corrida de 25 itens.
alter table public.checklist_modelo_itens add column if not exists secao text;
