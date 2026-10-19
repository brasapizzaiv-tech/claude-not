-- Cotação × fornecedores (Rafael, 19/10/2026):
--  * "Sempre convidar": fornecedor que recebe toda cotação. Ao abrir a tela
--    de fornecedores de uma cotação nova, os marcados (que vendem algum item
--    dela) entram convidados sozinhos — uma vez só por cotação, pra quem tirou
--    um à mão não ver ele voltar.
--  * "Enviado" do WhatsApp e o texto da mensagem saíram do navegador e vieram
--    pro sistema (continua de qualquer PC).
alter table public.fornecedores
  add column if not exists cotacao_padrao boolean not null default false;

alter table public.cotacao_fornecedores
  add column if not exists enviado_em timestamptz;

alter table public.cotacoes
  add column if not exists padrao_convidados_em timestamptz;

alter table public.wpp_config
  add column if not exists msg_cotacao text;
