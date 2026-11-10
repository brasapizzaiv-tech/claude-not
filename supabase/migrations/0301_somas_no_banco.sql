-- Somas e contagens feitas no banco (auditoria DES-008 e DES-009, Onda 4).
-- As duas rodam com as regras de quem chama (security invoker): cada um só
-- soma o que já podia ler.

-- Tela inicial: comandas abertas em cada dia pedido (o "dia" do restaurante
-- vai das 00:00 às 24:00 de Brasília = 03:00 UTC a 03:00 UTC). Antes eram 8
-- consultas, uma por dia.
create or replace function public.comandas_por_dia(p_dias date[])
returns table (dia date, n integer)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select d.dia, (
    select count(*)::int from pdv_comandas c
     where c.aberta_em >= (d.dia::timestamp + interval '3 hours') at time zone 'UTC'
       and c.aberta_em <  (d.dia::timestamp + interval '27 hours') at time zone 'UTC'
  )
  from unnest(p_dias) as d(dia);
$function$;
revoke all on function public.comandas_por_dia(date[]) from public, anon;
grant execute on function public.comandas_por_dia(date[]) to authenticated;

-- Notas fiscais (caixa): total das NFC-e autorizadas. Antes a tela baixava o
-- valor de TODAS as notas (2.751 e crescendo) pra somar no servidor.
create or replace function public.nfce_total_autorizado()
returns numeric
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select coalesce(sum(valor), 0) from nfce_emitidas where status = 'autorizado';
$function$;
revoke all on function public.nfce_total_autorizado() from public, anon;
grant execute on function public.nfce_total_autorizado() to authenticated;

notify pgrst, 'reload schema';
