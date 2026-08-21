-- Retorna, dentre um conjunto de notas, quais JÁ têm itens — agregando no banco
-- para não esbarrar no limite de 1000 linhas do PostgREST (que fazia notas com
-- itens continuarem marcadas como "aguardando itens" na tela).
create or replace function public.notas_com_itens(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct ni.nota_id
  from nota_itens ni
  where ni.nota_id = any(p_ids);
$$;

grant execute on function public.notas_com_itens(uuid[]) to authenticated;
