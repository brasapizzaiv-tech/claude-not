-- Continuação da 0215: trava nas funções "security definer" antigas que
-- qualquer pessoa sem login conseguia chamar com a chave anon (que é pública).
--
-- Ficam ABERTAS de propósito (o link é a senha, um código impossível de chutar):
--   colaborador_*          app da equipe /eu/{token} (+ PIN)
--   contar_*               contagem de estoque /contar/{token}
--   cotar_fornecedor_*     cotação do fornecedor /cotar/{token}
--   etiqueta_por_id,
--   etiqueta_baixa_scan    QR da etiqueta /e/{id} (o id da etiqueta é o código)
--   empresa_atual          só devolve o id da empresa, que não é segredo; e o
--                          RLS das telas públicas depende dela.
--
-- Fecham:
--   pdv_reiniciar_numeracao, contagem_referencia          -> só logado
--   contagem_rodar_agendamentos, gerar_contagem_agendada -> só o servidor (cron)
--   _cotar_extras, _contagem_referencia                  -> só por dentro de outra função

-- Peças que só podem rodar CHAMADAS POR OUTRA FUNÇÃO do banco (ex.: o link do
-- fornecedor chama _cotar_extras). A função que usa esta trava tem que ser
-- "security invoker": chamada direto pela API, quem roda é anon/authenticated
-- e trava; chamada de dentro de uma "security definer", quem roda é o dono
-- (postgres) e passa.
create or replace function public.exigir_interno()
returns void
language plpgsql
stable
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
end;
$$;

-- _cotar_extras: usada só dentro de cotar_fornecedor_dados.
CREATE OR REPLACE FUNCTION public._cotar_extras(p_cot uuid, p_forn uuid, p_prod uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  select public.exigir_interno();
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'marca', e.marca, 'preco_unit', e.preco_unit,
           'embalagem', e.embalagem, 'tamanho_embalagem', e.tamanho_embalagem,
           'observacao', e.observacao, 'st_inclusa', e.st_inclusa, 'st_pct', e.st_pct
         ) order by e.criado_em), '[]'::jsonb)
  from cotacao_ofertas_extra e
  where e.cotacao_id = p_cot and e.fornecedor_id = p_forn and e.produto_id = p_prod;
$function$;

-- O cálculo da referência da contagem saiu pra uma peça interna, porque é
-- usado por duas portas: o painel (logado) e o link da contagem (token).
CREATE OR REPLACE FUNCTION public._contagem_referencia(p_contagem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_ini timestamptz;
begin
  perform public.exigir_interno();
  select c.criado_em into v_ini from contagens c where c.id = p_contagem_id;
  if v_ini is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'produto_id', u.produto_id,
             'ultima_qtd', u.qtd,
             'ultima_data', u.data,
             'comprado', greatest(
               coalesce((
                 select sum(
                   case
                     when coalesce(ni.fator, 1) > 1 then ni.qtd * ni.fator
                     when upper(coalesce(ni.unidade, '')) in ('CX','CXA','FD','FDO','PCT','PC','SC','ENG','DZ','PACK','CJ')
                          and coalesce(pr.fardo, 0) > 0
                       then ni.qtd * pr.fardo
                     else ni.qtd
                   end)
                 from nota_itens ni
                 join notas_fiscais nf on nf.id = ni.nota_id
                 join produtos pr on pr.id = ni.produto_id
                 where ni.produto_id = u.produto_id
                   and nf.entrada_em is not null
                   and nf.entrada_em > u.criado_em
                   and nf.entrada_em <= now()
                   and coalesce(nf.situacao, '') <> 'cancelada'
               ), 0),
               coalesce((
                 select sum(coalesce(pi.qtd_recebida, pi.qtd))
                 from pedido_itens pi
                 join pedidos p on p.id = pi.pedido_id
                 where pi.produto_id = u.produto_id
                   and p.criado_em > u.criado_em
                   and p.criado_em <= now()
               ), 0)
             )
           ))
    from (
      select distinct on (ci.produto_id)
             ci.produto_id, ci.qtd_estoque as qtd, c.data, c.criado_em
      from contagem_itens ci
      join contagens c on c.id = ci.contagem_id
      where c.status = 'finalizada'
        and c.criado_em < v_ini
        and c.id <> p_contagem_id
      order by ci.produto_id, c.criado_em desc
    ) u
  ), '[]'::jsonb);
end;
$function$;

-- Painel /contagens/{id}: só logado.
CREATE OR REPLACE FUNCTION public.contagem_referencia(p_contagem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.exigir_logado();
  return public._contagem_referencia(p_contagem_id);
end;
$function$;

-- Link /contar/{token}: continua aberto, o token é a senha.
CREATE OR REPLACE FUNCTION public.contar_referencia(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cid uuid;
begin
  select cl.contagem_id into v_cid from contagem_links cl where cl.token = p_token;
  if v_cid is null then return '[]'::jsonb; end if;
  return public._contagem_referencia(v_cid);
end;
$function$;

-- Abrir caixa reinicia a numeração do salão: só logado.
CREATE OR REPLACE FUNCTION public.pdv_reiniciar_numeracao()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.exigir_logado();
  select setval('public.pdv_comandas_numero_seq', 1, false);
$function$;

-- Contagens agendadas: só o cron (/api/contagem/cron, chave de serviço).
CREATE OR REPLACE FUNCTION public.contagem_rodar_agendamentos()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_brt timestamp := (now() at time zone 'America/Sao_Paulo');
  v_dow int := extract(dow from v_brt);
  v_min int := extract(hour from v_brt) * 60 + extract(minute from v_brt);
  v_today date := v_brt::date;
  r record; v_cont uuid; v_criadas jsonb := '[]'::jsonb;
begin
  perform public.exigir_servidor();
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

-- Versão antiga (sem empresa), sobra da multiempresa. Ninguém chama; trava igual.
CREATE OR REPLACE FUNCTION public.gerar_contagem_agendada(p_nome text, p_modo text, p_divisao jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cont uuid; v_ult uuid;
begin
  perform public.exigir_servidor();
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
end; $function$;

CREATE OR REPLACE FUNCTION public.gerar_contagem_agendada(p_nome text, p_modo text, p_divisao jsonb DEFAULT NULL::jsonb, p_empresa uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cont uuid; v_ult uuid; v_emp uuid;
begin
  perform public.exigir_servidor();
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
