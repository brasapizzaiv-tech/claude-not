-- App das marmitas: limite de tentativas de senha (auditoria SEC-06, Onda 3).
-- Antes dava pra testar senha à vontade (a de 4 dígitos sai em minutos).
-- Agora:
--   * 5 erros do mesmo endereço em 15 min travam aquele endereço por 15 min;
--   * 50 erros somados de todos os endereços em 15 min travam a senha pra
--     todos por 15 min (quem troca de endereço a cada tentativa não escapa;
--     o dono logado no sistema continua entrando sem senha);
--   * acertar a senha NÃO zera a contagem (senão uma senha fraca qualquer
--     virava "reset" pra tentar a dos outros).
-- A contagem é feita numa linha só (insert ... on conflict), então tentativas
-- ao mesmo tempo não se atropelam, e uma trava ativa nunca é apagada.
create table if not exists public.mkt_login_falhas (
  ip          text primary key,
  erros       int not null default 0,
  primeiro_em timestamptz not null default now(),
  travado_ate timestamptz
);
alter table public.mkt_login_falhas enable row level security;
-- Sem policy: só as funções abaixo (chamadas pelo servidor).

create or replace function public.mkt_login_erro(p_ip text)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare k text; lim int;
begin
  perform public.exigir_servidor();
  foreach k in array array[left(coalesce(nullif(p_ip, ''), 'sem-ip'), 80), '*'] loop
    lim := case when k = '*' then 50 else 5 end;
    insert into mkt_login_falhas as t (ip, erros, primeiro_em, travado_ate)
    values (k, 1, now(), case when 1 >= lim then now() + interval '15 minutes' end)
    on conflict (ip) do update set
      erros = case when t.primeiro_em < now() - interval '15 minutes' then 1 else t.erros + 1 end,
      primeiro_em = case when t.primeiro_em < now() - interval '15 minutes' then now() else t.primeiro_em end,
      travado_ate = greatest(
        t.travado_ate,
        case when (case when t.primeiro_em < now() - interval '15 minutes' then 1 else t.erros + 1 end) >= lim
             then now() + interval '15 minutes' end);
  end loop;
end; $function$;

-- Até quando está travado (esse endereço ou todos). Null = pode tentar.
create or replace function public.mkt_login_travado(p_ip text)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $function$
  select max(travado_ate) from mkt_login_falhas
   where ip in (left(coalesce(nullif(p_ip, ''), 'sem-ip'), 80), '*') and travado_ate > now();
$function$;
