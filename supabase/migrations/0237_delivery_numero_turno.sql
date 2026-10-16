-- NUMERAÇÃO DO DELIVERY POR TURNO (pedido do Rafael, 16/10/2026)
-- Antes o nº do pedido era o da comanda, que divide a sequência com o salão e
-- só volta pro 1 quando o caixa abre. Agora o delivery tem número próprio que
-- recomeça em 1 a cada TURNO, e os turnos (nome, começa, acaba) se configuram
-- em /delivery/config. Turno que passa da meia-noite (ex.: noite 16:00–06:00)
-- conta como o dia em que começou.
--
-- Pedido agendado entra no turno do horário AGENDADO (o da noite feito no
-- almoço é da noite). O número fica gravado no pedido e não muda depois.

create table if not exists public.delivery_turnos (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas(id),
  nome       text not null,
  inicio     time not null,
  fim        time not null,
  ordem      int not null default 0,
  criado_em  timestamptz not null default now()
);
alter table public.delivery_turnos enable row level security;
drop policy if exists delivery_turnos_empresa on public.delivery_turnos;
create policy delivery_turnos_empresa on public.delivery_turnos for all to authenticated
  using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual());
grant select, insert, update, delete on public.delivery_turnos to authenticated, service_role;

insert into public.delivery_turnos (empresa_id, nome, inicio, fim, ordem)
select e.id, t.nome, t.inicio::time, t.fim::time, t.ordem
  from public.empresas e
  cross join (values ('Almoço', '06:00', '16:00', 1), ('Noite', '16:00', '06:00', 2)) as t(nome, inicio, fim, ordem)
 where not exists (select 1 from public.delivery_turnos d where d.empresa_id = e.id);

alter table public.delivery_pedidos
  add column if not exists turno text,
  add column if not exists turno_data date,
  add column if not exists numero_turno int;
create index if not exists delivery_pedidos_turno_idx on public.delivery_pedidos (empresa_id, turno_data, turno, numero_turno);

-- Qual turno (e de que dia) é um instante. Fora de todos os turnos → "Extra".
create or replace function public.delivery_turno_de(p_empresa uuid, p_quando timestamptz)
returns table (turno text, turno_data date)
language plpgsql stable security invoker set search_path = public as $$
declare
  t timestamp := p_quando at time zone 'America/Sao_Paulo';
  h time := t::time;
  r record;
begin
  for r in select d.nome, d.inicio, d.fim from public.delivery_turnos d where d.empresa_id = p_empresa order by d.ordem, d.inicio loop
    if r.inicio < r.fim then
      if h >= r.inicio and h < r.fim then turno := r.nome; turno_data := t::date; return next; return; end if;
    elsif r.inicio > r.fim then
      -- passa da meia-noite: depois do início é o dia; antes do fim é o dia anterior
      if h >= r.inicio then turno := r.nome; turno_data := t::date; return next; return; end if;
      if h < r.fim then turno := r.nome; turno_data := (t::date - 1); return next; return; end if;
    else
      -- início = fim: turno de 24 h
      turno := r.nome; turno_data := (case when h >= r.inicio then t::date else t::date - 1 end); return next; return;
    end if;
  end loop;
  turno := 'Extra'; turno_data := t::date; return next;
end $$;

-- Número na entrada do pedido: o próximo do turno, com trava pra dois
-- pedidos ao mesmo tempo não pegarem o mesmo número.
create or replace function public.delivery_pedidos_numerar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_turno text;
  v_data date;
begin
  if new.numero_turno is not null then return new; end if;
  select x.turno, x.turno_data into v_turno, v_data
    from public.delivery_turno_de(new.empresa_id, coalesce(new.agendado_para, new.criado_em, now())) x;
  perform pg_advisory_xact_lock(hashtext(new.empresa_id::text || v_data::text || v_turno));
  new.turno := v_turno;
  new.turno_data := v_data;
  new.numero_turno := coalesce((
    select max(p.numero_turno) from public.delivery_pedidos p
     where p.empresa_id = new.empresa_id and p.turno_data = v_data and p.turno = v_turno
  ), 0) + 1;
  return new;
end $$;

drop trigger if exists delivery_pedidos_numerar on public.delivery_pedidos;
create trigger delivery_pedidos_numerar before insert on public.delivery_pedidos
  for each row execute function public.delivery_pedidos_numerar();

-- Pedidos que já existem: turno e número pela ordem em que entraram.
with base as (
  select p.id, p.empresa_id, p.criado_em, x.turno, x.turno_data
    from public.delivery_pedidos p
    cross join lateral public.delivery_turno_de(p.empresa_id, coalesce(p.agendado_para, p.criado_em)) x
   where p.numero_turno is null
), num as (
  select id, turno, turno_data,
         row_number() over (partition by empresa_id, turno_data, turno order by criado_em) as n
    from base
)
update public.delivery_pedidos p
   set turno = num.turno, turno_data = num.turno_data, numero_turno = num.n
  from num
 where p.id = num.id;

grant execute on function public.delivery_turno_de(uuid, timestamptz) to authenticated, service_role;
