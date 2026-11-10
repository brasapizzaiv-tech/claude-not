-- Buffet: livre × quilo (DES-007, Onda 4). A análise precisa de cada prato
-- (medianas, simulação do preço do livre), então não dá pra somar no banco —
-- mas dá pra mandar os pratos de uma vez, já filtrados (almoço, sem marmita),
-- num JSON compacto: antes eram 6 páginas de 1000 comandas, uma esperando a
-- outra. [dia (Brasília), livre, peso, valor]. Regras de quem chama.
create or replace function public.buffet_pratos(p_de timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_array(
           to_char(aberta_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
           coalesce(livre, false),
           coalesce(peso, 0),
           coalesce(valor_buffet, 0)
         ) order by aberta_em), '[]'::jsonb)
    from pdv_comandas
   where valor_buffet > 0
     and status <> 'excluida'
     and aberta_em >= p_de
     and not coalesce(so_kg, false)
     and extract(hour from aberta_em at time zone 'America/Sao_Paulo') < 16;
$function$;
revoke all on function public.buffet_pratos(timestamptz) from public, anon;
grant execute on function public.buffet_pratos(timestamptz) to authenticated;

notify pgrst, 'reload schema';
