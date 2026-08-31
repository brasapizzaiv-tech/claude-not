-- Faturamento importado da planilha (Notas × Faturamento): nova origem
-- 'planilha' nos lançamentos — permite reimportar sem duplicar (o import
-- substitui os lançamentos 'planilha' das mesmas datas).
alter table public.lancamentos drop constraint if exists lancamentos_origem_check;
alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem in ('manual','pedido','nota','caixa','planilha'));
