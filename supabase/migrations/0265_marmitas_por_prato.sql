-- MARMITA POR PRATO (Rafael, 28/10/2026, ajuste da 0264): do lado de cada
-- prato do cardápio do dia, em quais marmitas ele vai — Tradicional (vem
-- marcado em todos), Do Dia (marca os que vão) e Premium (só no sábado; vem
-- marcado e desmarca o que não vai na marmita).
-- cardapio_dia.marmitas = {"tradicional": [...], "dia": [...], "premium": [...]}
-- (nomes dos pratos; vazio/ausente = padrão acima).
alter table public.cardapio_dia drop column if exists marmita_dia;
alter table public.cardapio_dia add column if not exists marmitas jsonb;

alter table public.pdv_item_grupos drop column if exists cardapio_so_marmita;
alter table public.pdv_item_grupos
  add column if not exists cardapio_marmita text check (cardapio_marmita in ('tradicional', 'dia', 'premium'));
