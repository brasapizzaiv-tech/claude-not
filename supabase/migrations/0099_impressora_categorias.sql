-- Roteamento por categoria (as "vias" do Suitable, de forma simples):
-- cada impressora que recebe comandas imprime só as categorias escolhidas.
-- Vazio/null = imprime TODAS as categorias.
alter table public.impressoras
  add column if not exists comanda_categorias text[];
