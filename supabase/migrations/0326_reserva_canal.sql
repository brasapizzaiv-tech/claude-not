-- Reservas: por onde a pessoa chegou ao site (pedido do Rafael, 23/11/2026).
-- "origem" continua dizendo se a reserva veio do site ou foi lançada pela
-- equipe; "canal" guarda o caminho até o site quando dá pra saber:
--   anuncio_meta       clicou no anúncio do Instagram/Facebook (utm do anúncio)
--   anuncio_google     clicou no anúncio do Google (gclid)
--   instagram_facebook veio de um link do Instagram/Facebook, anúncio ou não
--   outro texto        utm_source de algum link nosso
-- Vazio = entrou direto, pela busca ou por um link sem marcação.
-- Não guarda o identificador do clique, só o rótulo.
alter table public.reservas add column if not exists canal text;

notify pgrst, 'reload schema';
