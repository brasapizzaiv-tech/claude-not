-- Correção da 0292 (10/11/2026): os geradores do código de ativação
-- (gerar_codigo_colaborador / gerar_codigo_entregador) rodavam com o papel de
-- quem chama e procuravam "where codigo = ..." — a sessão não lê mais a coluna
-- codigo, então gerar código e cadastrar colaborador/entregador novo (a coluna
-- usa o gerador como valor padrão) davam "permission denied".
-- Agora rodam como o dono do banco (security definer), só devolvem o código.
create or replace function public.gerar_codigo_colaborador()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c text;
begin
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.colaboradores where codigo = c);
  end loop;
  return c;
end $function$;

create or replace function public.gerar_codigo_entregador()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c text;
begin
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.entregadores where codigo = c);
  end loop;
  return c;
end $function$;

revoke execute on function public.gerar_codigo_colaborador() from anon;
revoke execute on function public.gerar_codigo_entregador() from anon;
