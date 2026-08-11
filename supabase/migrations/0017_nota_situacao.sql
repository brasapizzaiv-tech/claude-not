-- Fluxo de aprovação da nota: só entra no financeiro quando o usuário manda.
alter table public.notas_fiscais
  add column if not exists situacao text not null default 'pendente'
    check (situacao in ('pendente', 'lancada', 'cancelada'));

-- Notas que já geraram lançamento passam a constar como 'lancada'.
update public.notas_fiscais nf
set situacao = 'lancada'
where exists (select 1 from public.lancamentos l where l.nota_id = nf.id);
