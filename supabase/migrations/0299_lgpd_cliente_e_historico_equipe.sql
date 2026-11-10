-- LGPD (auditoria SEC-16, Onda 3), com as decisões do Rafael em 10/11/2026:
--   1. cliente que pede a exclusão é ANONIMIZADO (nome, telefone, endereço,
--      CPF/CNPJ saem de todo lugar); valores, fiado, cashback e notas fiscais
--      ficam — a nota a lei manda guardar 5 anos;
--   2. colaborador com histórico (ponto, pagamentos, adiantamentos, atestados,
--      compras internas) não pode ser apagado, só desligado. Cadastro feito por
--      engano, sem nada, ainda pode;
--   3. nada automático: só a pedido.

-- ---------- 2. Histórico da equipe não some junto com o colaborador ----------
-- Antes: ON DELETE CASCADE (ou SET NULL) — apagar a pessoa levava o ponto, os
-- acertos da semana, adiantamentos e atestados, que a lei trabalhista manda
-- guardar. Agora o banco recusa (RESTRICT). O sistema não tem botão de apagar
-- colaborador; isso protege também contra apagar direto no banco.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('adiantamentos', 'adiantamentos_colaborador_id_fkey'),
      ('assiduidade_pagamentos', 'assiduidade_pagamentos_colaborador_id_fkey'),
      ('atestados', 'atestados_colaborador_id_fkey'),
      ('colaborador_documentos', 'colaborador_documentos_colaborador_id_fkey'),
      ('ponto_assinaturas', 'ponto_assinaturas_colaborador_id_fkey'),
      ('ponto_fechamentos', 'ponto_fechamentos_colaborador_id_fkey'),
      ('ponto_batidas', 'ponto_batidas_colaborador_id_fkey'),
      ('presencas', 'presencas_colaborador_id_fkey'),
      ('presencas_folgas', 'presencas_folgas_colaborador_id_fkey'),
      ('semana_extras', 'semana_extras_colaborador_id_fkey'),
      ('semana_pagamentos', 'semana_pagamentos_colaborador_id_fkey'),
      ('retiradas', 'retiradas_colaborador_id_fkey')
    ) as v(tabela, restricao)
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.tabela, r.restricao);
    execute format(
      'alter table public.%I add constraint %I foreign key (colaborador_id) references public.colaboradores(id) on delete restrict',
      r.tabela, r.restricao
    );
  end loop;
end $$;

-- ---------- 1. Anonimizar um cliente ----------
-- Roda como dono do banco (passa por pedidos, reservas, vales e mensagens, que
-- cada um tem a sua regra), conferindo: login, permissão da tela Clientes
-- (Salão, PDV, Delivery ou Financeiro) e a empresa. Recusa quem ainda deve
-- fiado — o restaurante precisa do contato pra receber.
-- O telefone liga o cliente ao que foi gravado sem o id (reserva, vale,
-- mensagens): compara só os números, pelo final (com ou sem 55/DDD).
create or replace function public.anonimizar_cliente(p_cliente uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cli record;
  v_tel text;
  v_fiado numeric;
  n int;
  v_resumo jsonb := '{}'::jsonb;
  c_removido constant text := 'Cliente removido';
begin
  perform public.exigir_logado();
  if not (public.tem_permissao('salao') or public.tem_permissao('pdv') or public.tem_permissao('delivery') or public.tem_permissao('financeiro')) then
    return jsonb_build_object('ok', false, 'erro', 'Sem permissão para apagar dados de cliente.');
  end if;

  select id, nome, telefone, empresa_id into v_cli from clientes where id = p_cliente;
  if v_cli.id is null or v_cli.empresa_id is distinct from public.empresa_atual() then
    return jsonb_build_object('ok', false, 'erro', 'Cliente não encontrado.');
  end if;
  if v_cli.nome = c_removido then
    return jsonb_build_object('ok', false, 'erro', 'Os dados deste cliente já foram apagados.');
  end if;

  select coalesce(sum(case when tipo = 'debito' then valor else -valor end), 0) into v_fiado
    from cliente_fiado where cliente_id = p_cliente;
  if v_fiado > 0.009 then
    return jsonb_build_object('ok', false, 'erro',
      format('Este cliente ainda deve R$ %s no fiado. Receba (ou dê baixa) antes de apagar os dados.', replace(to_char(v_fiado, 'FM999999990.00'), '.', ',')));
  end if;

  -- Últimos 8 números do telefone (com 8+ dígitos), pra achar o que não tem o id.
  v_tel := right(regexp_replace(coalesce(v_cli.telefone, ''), '\D', '', 'g'), 8);
  if length(v_tel) < 8 then v_tel := null; end if;

  update clientes set
    nome = c_removido, cpf_cnpj = null, ie = null, email = null, telefone = null,
    cep = null, logradouro = null, numero = null, complemento = null, bairro = null,
    municipio = null, uf = null, cod_municipio = null, nascimento = null,
    aceita_promocoes = false, aceita_aniversario = false, wpp_sair_em = coalesce(wpp_sair_em, now()),
    ativo = false
  where id = p_cliente;

  update delivery_pedidos set
    nome = c_removido, telefone = null, logradouro = null, numero = null, complemento = null,
    referencia = null, cep = null, lat = null, lng = null, observacao = null
  where empresa_id = v_cli.empresa_id
    and (cliente_id = p_cliente or (v_tel is not null and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = v_tel));
  get diagnostics n = row_count; v_resumo := v_resumo || jsonb_build_object('pedidos', n);

  if v_tel is not null then
    update reservas set nome = c_removido, telefone = '', nascimento = null, observacao = null
     where empresa_id = v_cli.empresa_id and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = v_tel;
    get diagnostics n = row_count; v_resumo := v_resumo || jsonb_build_object('reservas', n);

    update vales_presente set telefone = null, para_nome = c_removido, de_nome = null, mensagem = null
     where empresa_id = v_cli.empresa_id and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = v_tel;
    get diagnostics n = row_count; v_resumo := v_resumo || jsonb_build_object('vales', n);

    update whatsapp_mensagens set telefone = 'removido', texto = null, payload = null
     where empresa_id = v_cli.empresa_id and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = v_tel;
    get diagnostics n = row_count; v_resumo := v_resumo || jsonb_build_object('mensagens', n);

    update eventos set contato = c_removido, telefone = null
     where empresa_id = v_cli.empresa_id and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = v_tel;
  end if;

  update wpp_envios set telefone = 'removido', nome = null
   where cliente_id = p_cliente
      or (v_tel is not null and empresa_id = v_cli.empresa_id and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = v_tel);
  update vitrine_carrinhos set telefone = 'removido'
   where cliente_id = p_cliente
      or (v_tel is not null and empresa_id = v_cli.empresa_id and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = v_tel);
  update nfce_pendentes set cpf_cnpj = null where cliente_id = p_cliente and status <> 'emitida';

  return jsonb_build_object('ok', true, 'resumo', v_resumo);
end;
$function$;

revoke all on function public.anonimizar_cliente(uuid) from public, anon;
grant execute on function public.anonimizar_cliente(uuid) to authenticated;

notify pgrst, 'reload schema';
