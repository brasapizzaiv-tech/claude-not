-- 10% da noite puxado do CAIXA (Rafael, 23/10/2026): agora que a noite roda
-- toda no sistema, o 10% de cada noite é a soma do serviço cobrado nas
-- comandas (pdv_comandas.servico, gravado ao fechar). A tela Semana e 10% puxa
-- sozinha; digitado à mão vale mais e nunca é sobrescrito.
alter table public.dez_por_cento_noites
  add column if not exists origem text not null default 'manual' check (origem in ('manual', 'caixa'));

-- Serviço cobrado por NOITE: comanda fechada das 16:00 às 05:59 (Brasília) conta
-- pra noite que começou naquele dia (a que fecha de madrugada é da noite anterior).
create or replace function public.servico_noites(p_de date, p_ate date)
returns table (noite date, servico numeric, comandas integer)
language sql
stable
security invoker
set search_path = public
as $$
  select ((c.fechada_em at time zone 'America/Sao_Paulo') - interval '6 hours')::date as noite,
         round(sum(c.servico)::numeric, 2),
         count(*)::int
    from pdv_comandas c
   where c.servico > 0
     and c.fechada_em >= ((p_de::timestamp + interval '16 hours') at time zone 'America/Sao_Paulo')
     and c.fechada_em <  (((p_ate + 1)::timestamp + interval '6 hours') at time zone 'America/Sao_Paulo')
     and extract(hour from (c.fechada_em at time zone 'America/Sao_Paulo')) not between 6 and 15
   group by 1
$$;
grant execute on function public.servico_noites(date, date) to authenticated, service_role;
