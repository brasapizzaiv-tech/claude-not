-- Adiantamento pago com dinheiro do cofre (pedido do Rafael, 09/11/2026).
--
-- O acerto da semana e o adiantamento podem sair do cofre, nota por nota. A
-- saída do acerto fica ligada à conta da pessoa (lancamento_id, que já existe);
-- a do adiantamento, ao adiantamento (aqui). Apagar o adiantamento devolve o
-- dinheiro ao cofre; desfazer a saída no cofre apaga o adiantamento em aberto.
alter table public.cofre_movimentos
  add column if not exists adiantamento_id uuid references public.adiantamentos(id) on delete set null;

create index if not exists cofre_movimentos_adiantamento_idx
  on public.cofre_movimentos (adiantamento_id) where adiantamento_id is not null;
