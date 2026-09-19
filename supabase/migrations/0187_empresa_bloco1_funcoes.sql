-- ETAPA 2 DO MULTIEMPRESA — bloco 1, a parte que as regras não alcançam.
--
-- Carimbar as tabelas (0186) protege quem entra com login. Mas há dois outros
-- caminhos até o banco, e nenhum dos dois passa pelas regras:
--
--   • o código que usa a chave administrativa (os apps por link);
--   • as funções do banco marcadas como SECURITY DEFINER, que rodam com o
--     poder de quem as criou.
--
-- Revisei as dez funções do bloco 1. Oito partem de um token e só enxergam o
-- que pertence àquela cotação ou àquela contagem — essas já estão fechadas.
-- As três daqui varriam tabela inteira, e são as que esta migration conserta.

-- ---------- 1. A busca de produto da contagem ----------
-- A pessoa digita no app e o sistema procura no catálogo. Procurava no
-- catálogo INTEIRO. Com duas empresas no mesmo banco, alguém contando estoque
-- num restaurante veria o nome dos produtos do outro só digitando.
create or replace function public.contar_buscar_produtos(p_token text, p_busca text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_contagem uuid;
  v_empresa  uuid;
begin
  -- O token diz qual contagem é; a contagem diz de qual empresa.
  select cl.contagem_id, c.empresa_id
    into v_contagem, v_empresa
    from contagem_links cl
    join contagens c on c.id = cl.contagem_id
   where cl.token = p_token;
  if not found then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(x.item) from (
      select jsonb_build_object(
               'id', p.id, 'nome', p.nome, 'unidade', p.unidade,
               'categoria', coalesce(cat.nome, 'Sem categoria')) as item
      from produtos p
      left join categorias cat
        on cat.id = p.categoria_id and cat.empresa_id = v_empresa
      where p.ativo
        and p.empresa_id = v_empresa
        and unaccent(lower(p.nome)) like '%' || unaccent(lower(coalesce(p_busca, ''))) || '%'
      order by p.nome
      limit 12
    ) x
  ), '[]'::jsonb);
end;
$function$;

-- ---------- 2. A contagem que nasce sozinha ----------
-- O agendamento cria a contagem de madrugada, sem ninguém logado. Dois
-- problemas com mais de uma empresa: a contagem nasceria sem dono (a coluna
-- não aceita), e o rodízio automático cruzaria as categorias de uma empresa
-- com os colaboradores da outra. Agora a empresa vem por parâmetro.
drop function if exists public.gerar_contagem_agendada(text, text);

create or replace function public.gerar_contagem_agendada(
  p_nome text, p_modo text, p_divisao jsonb default null, p_empresa uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cont uuid; v_ult uuid; v_emp uuid;
begin
  v_emp := coalesce(p_empresa, public.empresa_atual());
  if v_emp is null then
    raise exception 'Contagem agendada sem empresa: não dá pra saber de quem é.';
  end if;

  insert into contagens (descricao, status, empresa_id)
    values (p_nome, 'rascunho', v_emp)
    returning id into v_cont;

  if p_modo = 'personalizado' then
    insert into contagem_atribuicoes (contagem_id, categoria_id, colaborador_id, empresa_id)
      select v_cont, (e->>'categoria_id')::uuid, (e->>'colaborador_id')::uuid, v_emp
        from jsonb_array_elements(coalesce(p_divisao, '[]'::jsonb)) e
       where nullif(e->>'categoria_id', '') is not null
         and nullif(e->>'colaborador_id', '') is not null;
  elsif p_modo = 'repetir_ultima' then
    select c.id into v_ult from contagens c
     where c.id <> v_cont
       and c.empresa_id = v_emp
       and exists (select 1 from contagem_atribuicoes a where a.contagem_id = c.id)
     order by c.criado_em desc limit 1;
    if v_ult is not null then
      insert into contagem_atribuicoes (contagem_id, categoria_id, colaborador_id, empresa_id)
        select v_cont, categoria_id, colaborador_id, v_emp
          from contagem_atribuicoes where contagem_id = v_ult;
    end if;
  end if;

  -- Rodízio automático quando não caiu em nenhuma divisão. Categorias e
  -- colaboradores agora só os da empresa da contagem.
  if p_modo <> 'personalizado'
     and not exists (select 1 from contagem_atribuicoes where contagem_id = v_cont) then
    insert into contagem_atribuicoes (contagem_id, categoria_id, colaborador_id, empresa_id)
    select v_cont, cat.id, col.id, v_emp
      from (select id, (row_number() over (order by nome)) - 1 as rn
              from categorias where empresa_id = v_emp) cat
      join (select id, (row_number() over (order by nome)) - 1 as rn,
                   count(*) over () as total
              from colaboradores where ativo and empresa_id = v_emp) col
        on (cat.rn % col.total) = col.rn;
  end if;

  insert into contagem_links (contagem_id, colaborador_id, token, empresa_id)
    select v_cont, d.colaborador_id, replace(gen_random_uuid()::text, '-', ''), v_emp
      from (select distinct colaborador_id
              from contagem_atribuicoes where contagem_id = v_cont) d;

  return v_cont;
end;
$function$;

-- ---------- 3. O relógio que dispara os agendamentos ----------
-- Roda uma vez pra todas as empresas (é um relógio só), mas cada contagem
-- criada nasce na empresa do agendamento que a pediu.
create or replace function public.contagem_rodar_agendamentos()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    v_cont := gerar_contagem_agendada(
      r.nome || ' — ' || to_char(v_brt, 'DD/MM'), r.modo, r.divisao, r.empresa_id
    );
    update contagem_agendamentos set ultima_exec = v_today where id = r.id;
    v_criadas := v_criadas || jsonb_build_object('agendamento', r.nome, 'contagem', v_cont);
  end loop;
  return jsonb_build_object('criadas', v_criadas);
end;
$function$;
