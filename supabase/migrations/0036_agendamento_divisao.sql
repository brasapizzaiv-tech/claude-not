-- Divisão personalizada no agendamento: quem conta cada seção (categoria).
-- divisao = JSON [{ categoria_id, colaborador_id }, ...]
alter table public.contagem_agendamentos
  add column if not exists divisao jsonb;

-- Aceita o modo "personalizado" além de repetir_ultima/todos.
alter table public.contagem_agendamentos drop constraint if exists contagem_agendamentos_modo_check;
alter table public.contagem_agendamentos
  add constraint contagem_agendamentos_modo_check
  check (modo in ('repetir_ultima', 'todos', 'personalizado'));

-- Recria a geração aceitando a divisão personalizada.
create or replace function public.gerar_contagem_agendada(
  p_nome text, p_modo text, p_divisao jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_cont uuid; v_ult uuid;
begin
  insert into contagens (descricao, status) values (p_nome, 'rascunho')
    returning id into v_cont;

  if p_modo = 'personalizado' then
    insert into contagem_atribuicoes (contagem_id, categoria_id, colaborador_id)
      select v_cont, (e->>'categoria_id')::uuid, (e->>'colaborador_id')::uuid
        from jsonb_array_elements(coalesce(p_divisao, '[]'::jsonb)) e
       where nullif(e->>'categoria_id', '') is not null
         and nullif(e->>'colaborador_id', '') is not null;
  elsif p_modo = 'repetir_ultima' then
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

  -- Rodízio automático se não caiu em nenhuma divisão (modo "todos" ou
  -- "repetir_ultima" sem contagem anterior). "Personalizado" nunca cai aqui.
  if p_modo <> 'personalizado'
     and not exists (select 1 from contagem_atribuicoes where contagem_id = v_cont) then
    insert into contagem_atribuicoes (contagem_id, categoria_id, colaborador_id)
    select v_cont, cat.id, col.id
      from (select id, (row_number() over (order by nome)) - 1 as rn from categorias) cat
      join (select id, (row_number() over (order by nome)) - 1 as rn,
                   count(*) over () as total
              from colaboradores where ativo) col
        on (cat.rn % col.total) = col.rn;
  end if;

  insert into contagem_links (contagem_id, colaborador_id, token)
    select v_cont, d.colaborador_id, replace(gen_random_uuid()::text, '-', '')
      from (select distinct colaborador_id
              from contagem_atribuicoes where contagem_id = v_cont) d;

  return v_cont;
end; $$;

-- Passa a divisão do agendamento para a geração.
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
    v_cont := gerar_contagem_agendada(r.nome || ' — ' || to_char(v_brt, 'DD/MM'), r.modo, r.divisao);
    update contagem_agendamentos set ultima_exec = v_today where id = r.id;
    v_criadas := v_criadas || jsonb_build_object('agendamento', r.nome, 'contagem', v_cont);
  end loop;
  return jsonb_build_object('criadas', v_criadas);
end; $$;
