-- Reservas no app da equipe (pedido do Rafael, 13/11/2026): a tela da
-- recepção (/reservas/hoje) só abria pelo painel, com login. Agora quem tem a
-- caixinha "Recepção (reservas)" no cadastro vê "Reservas de hoje" no app
-- /eu (código + PIN): marcar quem chegou e a mesa. A conferência é no
-- servidor (src/app/eu/[token]/reservas/actions.ts).
alter table public.colaboradores
  add column if not exists faz_recepcao boolean not null default false;

notify pgrst, 'reload schema';
