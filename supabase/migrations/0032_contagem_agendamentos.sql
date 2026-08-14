-- Agendamentos de contagem: o usuário configura quantos quiser.
create table if not exists public.contagem_agendamentos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  frequencia  text not null default 'semanal'
              check (frequencia in ('diario', 'semanal', 'quinzenal')),
  dia_semana  int,          -- 0=domingo .. 6=sábado (nulo para diário)
  hora        int not null default 8 check (hora between 0 and 23),
  minuto      int not null default 0 check (minuto between 0 and 59),
  modo        text not null default 'repetir_ultima'
              check (modo in ('repetir_ultima', 'todos')),
  ativo       boolean not null default true,
  ultima_exec date,
  criado_em   timestamptz not null default now()
);

alter table public.contagem_agendamentos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='contagem_agendamentos' and policyname='ag_all') then
    create policy "ag_all" on public.contagem_agendamentos
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Cria uma contagem a partir de um agendamento, replicando a divisão da última
-- contagem (ou distribuindo tudo para todos) e gerando os links dos colaboradores.
create or replace function public.gerar_contagem_agendada(p_nome text, p_modo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cont uuid; v_ult uuid;
begin
  insert into contagens (descricao, status) values (p_nome, 'rascunho')
    returning id into v_cont;

  if p_modo = 'repetir_ultima' then
    select c.id into v_ult from contagens c
     where c.id <> v_cont
       and exists (select 1 from contagem_atribuicoes a where a.contagem_id = c.id)
     order by c.criado_em desc limit 1;
    if v_ult is not null then
      insert into contagem_atribuicoes (contagem_id, categoria_id, colaborador_id)
        select v_cont, categoria_id, colaborador_id
          from contagem_atribuicoes where contagem_id = v_ult;
    end if;
  end if;

  -- Sem divisão anterior (ou modo "todos"): todos contam todas as categorias.
  if p_modo = 'todos' or v_ult is null then
    insert into contagem_atribuicoes (contagem_id, categoria_id, colaborador_id)
      select v_cont, cat.id, col.id
        from categorias cat cross join colaboradores col where col.ativo;
  end if;

  -- Um link (token) por colaborador que tem atribuição nesta contagem.
  insert into contagem_links (contagem_id, colaborador_id, token)
    select distinct v_cont, colaborador_id, replace(gen_random_uuid()::text, '-', '')
      from contagem_atribuicoes where contagem_id = v_cont;

  return v_cont;
end; $$;

-- Roda os agendamentos que estão na hora (fuso de São Paulo). Idempotente:
-- não cria duas vezes no mesmo dia.
create or replace function public.contagem_rodar_agendamentos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_brt timestamp := (now() at time zone 'America/Sao_Paulo');
  v_dow int := extract(dow from v_brt);
  v_min int := extract(hour from v_brt) * 60 + extract(minute from v_brt);
  v_today date := v_brt::date;
  r record; v_cont uuid; v_criadas jsonb := '[]'::jsonb;
begin
  for r in select * from contagem_agendamentos where ativo loop
    if r.ultima_exec = v_today then continue; end if;
    if v_min < (r.hora * 60 + r.minuto) then continue; end if;
    if r.frequencia = 'semanal' and r.dia_semana <> v_dow then continue; end if;
    if r.frequencia = 'quinzenal' then
      if r.dia_semana <> v_dow then continue; end if;
      if r.ultima_exec is not null and (v_today - r.ultima_exec) < 14 then continue; end if;
    end if;
    v_cont := gerar_contagem_agendada(r.nome || ' — ' || to_char(v_brt, 'DD/MM'), r.modo);
    update contagem_agendamentos set ultima_exec = v_today where id = r.id;
    v_criadas := v_criadas || jsonb_build_object('agendamento', r.nome, 'contagem', v_cont);
  end loop;
  return jsonb_build_object('criadas', v_criadas);
end; $$;

grant execute on function public.contagem_rodar_agendamentos() to service_role;
