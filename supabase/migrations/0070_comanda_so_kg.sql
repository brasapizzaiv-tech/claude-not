-- Marmita: comanda cobrada só por kg (sem virar "à vontade/livre"). Guarda o
-- marcador para o caixa poder trocar rápido e recalcular.
alter table public.pdv_comandas
  add column if not exists so_kg boolean not null default false;
