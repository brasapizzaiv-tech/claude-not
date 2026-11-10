-- Conciliação bancária (DES-002, Onda 4): os meses que têm extrato, pros
-- botões de mês, sem baixar as 1,5 mil transações. Regras de quem chama.
create or replace function public.transacoes_meses()
returns table (mes text)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select distinct to_char(data, 'YYYY-MM') as mes from transacoes_banco where data is not null order by 1 desc;
$function$;
revoke all on function public.transacoes_meses() from public, anon;
grant execute on function public.transacoes_meses() to authenticated;

create index if not exists transacoes_banco_data_idx on public.transacoes_banco (data);

notify pgrst, 'reload schema';
