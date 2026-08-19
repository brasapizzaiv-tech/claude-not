-- Liga o fechamento de caixa ao financeiro: o faturamento vira receita no DRE.
alter table public.lancamentos
  add column if not exists fechamento_id uuid
    references public.fechamentos_caixa (id) on delete cascade;

-- Permite a origem "caixa" nos lançamentos.
alter table public.lancamentos drop constraint if exists lancamentos_origem_check;
alter table public.lancamentos
  add constraint lancamentos_origem_check
  check (origem in ('manual', 'pedido', 'nota', 'caixa'));

-- Categorias de receita usadas pelo fechamento de caixa (Cartão junto e Saldo).
insert into public.dre_categorias (tipo, grupo, nome, ordem)
select 'receita', 'Receita Bruta', 'Cartão',
       coalesce((select max(ordem) from public.dre_categorias), 0) + 1
where not exists (
  select 1 from public.dre_categorias where tipo = 'receita' and nome = 'Cartão'
);

insert into public.dre_categorias (tipo, grupo, nome, ordem)
select 'receita', 'Receita Bruta', 'Saldo',
       coalesce((select max(ordem) from public.dre_categorias), 0) + 1
where not exists (
  select 1 from public.dre_categorias where tipo = 'receita' and nome = 'Saldo'
);
