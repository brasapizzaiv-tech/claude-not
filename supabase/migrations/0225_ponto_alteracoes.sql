-- ALTERAÇÕES DE PONTO no espelho (igual ao menu da batida no RHiD):
--  - desconsiderar marcação (fica riscada, não conta em nada);
--  - deslocar pra direita/esquerda (muda de coluna: entrada vira saída etc.);
--  - deslocar pro dia anterior/próximo (muda o dia do turno).
-- A batida original nunca é apagada; fica registrado quem mexeu e quando.
alter table public.ponto_batidas
  add column if not exists desconsiderada boolean not null default false,
  add column if not exists deslocamento integer not null default 0,
  add column if not exists ajustada_por uuid,
  add column if not exists ajustada_em timestamptz;
