-- Valor do boleto != valor da nota: o fornecedor/banco cobra custas, juros ou
-- da desconto. Guardamos o valor cobrado de verdade (notas_fiscais.valor_boleto)
-- e a diferenca vira um lancamento a parte (lancamentos.ajuste = true) em
-- "Despesas Bancarias" — assim o CMV segue com o valor da mercadoria e o boleto
-- fecha com o que foi realmente pago.
alter table public.notas_fiscais
  add column if not exists valor_boleto numeric;

alter table public.lancamentos
  add column if not exists ajuste boolean not null default false;

-- Categoria usada pelo ajuste (ja existe no seed do DRE; garante em bases antigas).
insert into public.dre_categorias (tipo, grupo, nome, ordem)
select 'financeira', 'Financeiras', 'Despesas Bancárias',
       coalesce((select max(ordem) from public.dre_categorias), 0) + 1
where not exists (
  select 1 from public.dre_categorias
  where tipo = 'financeira' and nome = 'Despesas Bancárias'
);
