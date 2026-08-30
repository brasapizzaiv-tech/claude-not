-- Cardápio unificado (um lugar só, estilo Suitable):
-- - canais por item: App (coluna delivery, já existia), Garçom e PDV
-- - disponível/indisponível manual por item (ex.: esgotou)
-- - horários de disponibilidade (dias da semana + turnos) por categoria e por
--   item, valendo pro app do cliente. jsonb: {"dias":[0..6],"turnos":[{"ini":"00:00","fim":"15:00"}]}
--   null = sempre disponível.

alter table public.pdv_itens
  add column if not exists canal_garcom boolean not null default true,
  add column if not exists canal_pdv    boolean not null default true,
  add column if not exists disponivel   boolean not null default true,
  add column if not exists horarios     jsonb;

alter table public.pdv_categorias
  add column if not exists horarios jsonb;
