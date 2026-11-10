-- Equipe e dinheiro por módulo (auditoria SEC-04, fase B, lote 2, Onda 3).
--
-- Até aqui toda tabela abaixo tinha a mesma regra: qualquer login da empresa
-- lê, grava e apaga (até o do quiosque da balança). Agora cada uma só abre pra
-- quem tem a permissão do módulo que a usa (o dono tem tudo). As telas de
-- outros módulos que precisam de um pedaço (tela inicial, mural, sangria do
-- caixa) passaram a ler pelo servidor depois de conferir a permissão — esse
-- código vai pro ar ANTES desta migration.
--
-- `(select tem_permissao(...))` entre parênteses: o banco calcula uma vez por
-- consulta, não linha por linha (ponto_batidas e notas_emitidas são grandes).

-- adiantamentos: Colaboradores, Cofre
drop policy if exists adiantamentos_empresa on public.adiantamentos;
drop policy if exists adiantamentos_modulo on public.adiantamentos;
create policy adiantamentos_modulo on public.adiantamentos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores')) or (select public.tem_permissao('cofre'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores')) or (select public.tem_permissao('cofre'))));

-- assiduidade_config: Colaboradores
drop policy if exists assiduidade_config_empresa on public.assiduidade_config;
drop policy if exists assiduidade_config_modulo on public.assiduidade_config;
create policy assiduidade_config_modulo on public.assiduidade_config for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- assiduidade_pagamentos: Colaboradores
drop policy if exists assiduidade_pagamentos_empresa on public.assiduidade_pagamentos;
drop policy if exists assiduidade_pagamentos_modulo on public.assiduidade_pagamentos;
create policy assiduidade_pagamentos_modulo on public.assiduidade_pagamentos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- atestados: Colaboradores
drop policy if exists atestados_empresa on public.atestados;
drop policy if exists atestados_modulo on public.atestados;
create policy atestados_modulo on public.atestados for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- colaborador_documentos: Colaboradores
drop policy if exists colaborador_documentos_empresa on public.colaborador_documentos;
drop policy if exists colaborador_documentos_modulo on public.colaborador_documentos;
create policy colaborador_documentos_modulo on public.colaborador_documentos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- colaborador_horarios: Colaboradores
drop policy if exists colaborador_horarios_empresa on public.colaborador_horarios;
drop policy if exists colaborador_horarios_modulo on public.colaborador_horarios;
create policy colaborador_horarios_modulo on public.colaborador_horarios for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- colaborador_cargos: Colaboradores
drop policy if exists colaborador_cargos_empresa on public.colaborador_cargos;
drop policy if exists colaborador_cargos_modulo on public.colaborador_cargos;
create policy colaborador_cargos_modulo on public.colaborador_cargos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- dez_por_cento_noites: Colaboradores
drop policy if exists dez_por_cento_noites_empresa on public.dez_por_cento_noites;
drop policy if exists dez_por_cento_noites_modulo on public.dez_por_cento_noites;
create policy dez_por_cento_noites_modulo on public.dez_por_cento_noites for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- garcom_convites: Colaboradores
drop policy if exists garcom_convites_empresa on public.garcom_convites;
drop policy if exists garcom_convites_modulo on public.garcom_convites;
create policy garcom_convites_modulo on public.garcom_convites for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- ponto_batidas: Colaboradores
drop policy if exists ponto_batidas_empresa on public.ponto_batidas;
drop policy if exists ponto_batidas_modulo on public.ponto_batidas;
create policy ponto_batidas_modulo on public.ponto_batidas for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- ponto_fechamentos: Colaboradores
drop policy if exists ponto_fechamentos_empresa on public.ponto_fechamentos;
drop policy if exists ponto_fechamentos_modulo on public.ponto_fechamentos;
create policy ponto_fechamentos_modulo on public.ponto_fechamentos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- ponto_horarios: Colaboradores
drop policy if exists ponto_horarios_empresa on public.ponto_horarios;
drop policy if exists ponto_horarios_modulo on public.ponto_horarios;
create policy ponto_horarios_modulo on public.ponto_horarios for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- ponto_horario_excecoes: Colaboradores
drop policy if exists ponto_horario_excecoes_empresa on public.ponto_horario_excecoes;
drop policy if exists ponto_horario_excecoes_modulo on public.ponto_horario_excecoes;
create policy ponto_horario_excecoes_modulo on public.ponto_horario_excecoes for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- ponto_assinaturas: Colaboradores
drop policy if exists ponto_assinaturas_empresa on public.ponto_assinaturas;
drop policy if exists ponto_assinaturas_modulo on public.ponto_assinaturas;
create policy ponto_assinaturas_modulo on public.ponto_assinaturas for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- presencas: Colaboradores
drop policy if exists presencas_empresa on public.presencas;
drop policy if exists presencas_modulo on public.presencas;
create policy presencas_modulo on public.presencas for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- presencas_folgas: Colaboradores
drop policy if exists presencas_folgas_empresa on public.presencas_folgas;
drop policy if exists presencas_folgas_modulo on public.presencas_folgas;
create policy presencas_folgas_modulo on public.presencas_folgas for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- semana_extras: Colaboradores
drop policy if exists semana_extras_empresa on public.semana_extras;
drop policy if exists semana_extras_modulo on public.semana_extras;
create policy semana_extras_modulo on public.semana_extras for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- semana_pagamentos: Colaboradores
drop policy if exists semana_pagamentos_empresa on public.semana_pagamentos;
drop policy if exists semana_pagamentos_modulo on public.semana_pagamentos;
create policy semana_pagamentos_modulo on public.semana_pagamentos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('colaboradores'))));

-- folgas_ajustes: Folgas
drop policy if exists folgas_ajustes_empresa on public.folgas_ajustes;
drop policy if exists folgas_ajustes_modulo on public.folgas_ajustes;
create policy folgas_ajustes_modulo on public.folgas_ajustes for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('folgas'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('folgas'))));

-- folgas_bloqueios: Folgas
drop policy if exists folgas_bloqueios_empresa on public.folgas_bloqueios;
drop policy if exists folgas_bloqueios_modulo on public.folgas_bloqueios;
create policy folgas_bloqueios_modulo on public.folgas_bloqueios for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('folgas'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('folgas'))));

-- folgas_limites: Folgas
drop policy if exists folgas_limites_empresa on public.folgas_limites;
drop policy if exists folgas_limites_modulo on public.folgas_limites;
create policy folgas_limites_modulo on public.folgas_limites for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('folgas'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('folgas'))));

-- folgas_funcionarios: Folgas, Colaboradores
drop policy if exists folgas_funcionarios_empresa on public.folgas_funcionarios;
drop policy if exists folgas_funcionarios_modulo on public.folgas_funcionarios;
create policy folgas_funcionarios_modulo on public.folgas_funcionarios for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('folgas')) or (select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('folgas')) or (select public.tem_permissao('colaboradores'))));

-- folgas_pedidos: Folgas, Colaboradores
drop policy if exists folgas_pedidos_empresa on public.folgas_pedidos;
drop policy if exists folgas_pedidos_modulo on public.folgas_pedidos;
create policy folgas_pedidos_modulo on public.folgas_pedidos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('folgas')) or (select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('folgas')) or (select public.tem_permissao('colaboradores'))));

-- lancamentos: Contas a pagar (o Financeiro completo inclui), Notas Fiscais, Conferência, Colaboradores, Cofre
drop policy if exists lancamentos_empresa on public.lancamentos;
drop policy if exists lancamentos_modulo on public.lancamentos;
create policy lancamentos_modulo on public.lancamentos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('contas')) or (select public.tem_permissao('notas')) or (select public.tem_permissao('conferencia')) or (select public.tem_permissao('colaboradores')) or (select public.tem_permissao('cofre'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('contas')) or (select public.tem_permissao('notas')) or (select public.tem_permissao('conferencia')) or (select public.tem_permissao('colaboradores')) or (select public.tem_permissao('cofre'))));

-- fechamentos_caixa: Financeiro
drop policy if exists fechamentos_caixa_empresa on public.fechamentos_caixa;
drop policy if exists fechamentos_caixa_modulo on public.fechamentos_caixa;
create policy fechamentos_caixa_modulo on public.fechamentos_caixa for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))));

-- faturamento_dia: Financeiro
drop policy if exists faturamento_dia_empresa on public.faturamento_dia;
drop policy if exists faturamento_dia_modulo on public.faturamento_dia;
create policy faturamento_dia_modulo on public.faturamento_dia for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))));

-- faturamento_dias: Financeiro
drop policy if exists faturamento_dias_empresa on public.faturamento_dias;
drop policy if exists faturamento_dias_modulo on public.faturamento_dias;
create policy faturamento_dias_modulo on public.faturamento_dias for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))));

-- transacoes_banco: Financeiro
drop policy if exists transacoes_banco_empresa on public.transacoes_banco;
drop policy if exists transacoes_banco_modulo on public.transacoes_banco;
create policy transacoes_banco_modulo on public.transacoes_banco for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))));

-- orcamentos: Financeiro
drop policy if exists orcamentos_empresa on public.orcamentos;
drop policy if exists orcamentos_modulo on public.orcamentos;
create policy orcamentos_modulo on public.orcamentos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))));

-- fatura_regras: Financeiro
drop policy if exists fatura_regras_empresa on public.fatura_regras;
drop policy if exists fatura_regras_modulo on public.fatura_regras;
create policy fatura_regras_modulo on public.fatura_regras for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))));

-- notas_emitidas: Financeiro
drop policy if exists notas_emitidas_empresa on public.notas_emitidas;
drop policy if exists notas_emitidas_modulo on public.notas_emitidas;
create policy notas_emitidas_modulo on public.notas_emitidas for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))));

-- cmv_compras_manual: Financeiro
drop policy if exists cmv_compras_manual_empresa on public.cmv_compras_manual;
drop policy if exists cmv_compras_manual_modulo on public.cmv_compras_manual;
create policy cmv_compras_manual_modulo on public.cmv_compras_manual for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('financeiro'))));

-- notas_fiscais: Notas Fiscais, Contas a pagar (o Financeiro completo inclui), Conferência
drop policy if exists notas_fiscais_empresa on public.notas_fiscais;
drop policy if exists notas_fiscais_modulo on public.notas_fiscais;
create policy notas_fiscais_modulo on public.notas_fiscais for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('notas')) or (select public.tem_permissao('contas')) or (select public.tem_permissao('conferencia'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('notas')) or (select public.tem_permissao('contas')) or (select public.tem_permissao('conferencia'))));

-- nota_itens: Notas Fiscais, Contas a pagar (o Financeiro completo inclui), Conferência
drop policy if exists nota_itens_empresa on public.nota_itens;
drop policy if exists nota_itens_modulo on public.nota_itens;
create policy nota_itens_modulo on public.nota_itens for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('notas')) or (select public.tem_permissao('contas')) or (select public.tem_permissao('conferencia'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('notas')) or (select public.tem_permissao('contas')) or (select public.tem_permissao('conferencia'))));

-- nota_parcelas: Notas Fiscais, Contas a pagar (o Financeiro completo inclui)
drop policy if exists nota_parcelas_empresa on public.nota_parcelas;
drop policy if exists nota_parcelas_modulo on public.nota_parcelas;
create policy nota_parcelas_modulo on public.nota_parcelas for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('notas')) or (select public.tem_permissao('contas'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('notas')) or (select public.tem_permissao('contas'))));

-- cofre_movimentos: Cofre, Colaboradores
drop policy if exists cofre_movimentos_empresa on public.cofre_movimentos;
drop policy if exists cofre_movimentos_modulo on public.cofre_movimentos;
create policy cofre_movimentos_modulo on public.cofre_movimentos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('cofre')) or (select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('cofre')) or (select public.tem_permissao('colaboradores'))));

-- cofre_config: Cofre, Colaboradores
drop policy if exists cofre_config_empresa on public.cofre_config;
drop policy if exists cofre_config_modulo on public.cofre_config;
create policy cofre_config_modulo on public.cofre_config for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('cofre')) or (select public.tem_permissao('colaboradores'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('cofre')) or (select public.tem_permissao('colaboradores'))));

-- cofre_denominacoes: Cofre
drop policy if exists cofre_denominacoes_empresa on public.cofre_denominacoes;
drop policy if exists cofre_denominacoes_modulo on public.cofre_denominacoes;
create policy cofre_denominacoes_modulo on public.cofre_denominacoes for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('cofre'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('cofre'))));

-- cofre_pedidos: Cofre
drop policy if exists cofre_pedidos_empresa on public.cofre_pedidos;
drop policy if exists cofre_pedidos_modulo on public.cofre_pedidos;
create policy cofre_pedidos_modulo on public.cofre_pedidos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('cofre'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('cofre'))));

-- Arquivos dos atestados e dos documentos da equipe: só quem tem Colaboradores
-- (o app da equipe sobe pelo servidor, que passa por cima disso).
drop policy if exists atestados_arquivos on storage.objects;
create policy atestados_arquivos on storage.objects for all to authenticated
  using (bucket_id = 'atestados' and (storage.foldername(name))[1] = (public.empresa_atual())::text and (select public.tem_permissao('colaboradores')))
  with check (bucket_id = 'atestados' and (storage.foldername(name))[1] = (public.empresa_atual())::text and (select public.tem_permissao('colaboradores')));
drop policy if exists documentos_equipe_arquivos on storage.objects;
create policy documentos_equipe_arquivos on storage.objects for all to authenticated
  using (bucket_id = 'documentos-equipe' and (storage.foldername(name))[1] = (public.empresa_atual())::text and (select public.tem_permissao('colaboradores')))
  with check (bucket_id = 'documentos-equipe' and (storage.foldername(name))[1] = (public.empresa_atual())::text and (select public.tem_permissao('colaboradores')));

-- Mesclar produtos (tela Produtos) mexe em notas e no CMV manual: roda como
-- dono do banco, conferindo a permissão Produtos e a empresa.
CREATE OR REPLACE FUNCTION public.mesclar_produtos(p_de uuid, p_para uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_de record;
  v_para record;
  n int;
  v_resumo jsonb := '{}'::jsonb;
begin
  perform public.exigir_logado();
  if not public.tem_permissao('produtos') then
    return jsonb_build_object('ok', false, 'erro', 'Sem permissão para mesclar produtos.');
  end if;
  if p_de is null or p_para is null or p_de = p_para then
    return jsonb_build_object('ok', false, 'erro', 'Escolha dois produtos diferentes.');
  end if;
  select id, nome, empresa_id into v_de from produtos where id = p_de;
  select id, nome, empresa_id, ativo into v_para from produtos where id = p_para;
  if v_de.id is null or v_para.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Produto não encontrado.');
  end if;
  if v_de.empresa_id is distinct from public.empresa_atual() or v_para.empresa_id is distinct from public.empresa_atual() then
    return jsonb_build_object('ok', false, 'erro', 'Produto não encontrado.');
  end if;
  if v_de.empresa_id <> v_para.empresa_id then
    return jsonb_build_object('ok', false, 'erro', 'Produtos de empresas diferentes.');
  end if;

  -- Contagem: o mesmo item contado com os dois nomes na mesma contagem soma.
  update contagem_itens a
     set qtd_estoque = a.qtd_estoque + b.qtd_estoque,
         qtd_pedir = a.qtd_pedir + b.qtd_pedir,
         parcelas = case when jsonb_typeof(a.parcelas) = 'array' and jsonb_typeof(b.parcelas) = 'array'
                         then a.parcelas || b.parcelas else coalesce(a.parcelas, b.parcelas) end,
         precisa_comprar = coalesce(a.precisa_comprar, false) or coalesce(b.precisa_comprar, false)
    from contagem_itens b
   where a.produto_id = p_para and b.produto_id = p_de and a.contagem_id = b.contagem_id;
  delete from contagem_itens b where b.produto_id = p_de
     and exists (select 1 from contagem_itens a where a.produto_id = p_para and a.contagem_id = b.contagem_id);
  update contagem_itens set produto_id = p_para where produto_id = p_de;
  get diagnostics n = row_count; v_resumo := v_resumo || jsonb_build_object('contagens', n);

  -- Cotação: quantidade soma.
  update cotacao_itens a set qtd = a.qtd + b.qtd
    from cotacao_itens b
   where a.produto_id = p_para and b.produto_id = p_de and a.cotacao_id = b.cotacao_id;
  delete from cotacao_itens b where b.produto_id = p_de
     and exists (select 1 from cotacao_itens a where a.produto_id = p_para and a.cotacao_id = b.cotacao_id);
  update cotacao_itens set produto_id = p_para where produto_id = p_de;

  -- Preço do mesmo fornecedor na mesma cotação: fica o do produto que fica.
  delete from cotacao_precos b where b.produto_id = p_de
     and exists (select 1 from cotacao_precos a where a.produto_id = p_para and a.cotacao_id = b.cotacao_id and a.fornecedor_id = b.fornecedor_id);
  update cotacao_precos set produto_id = p_para where produto_id = p_de;
  update cotacao_ofertas_extra set produto_id = p_para where produto_id = p_de;

  -- Pedido com os dois no mesmo pedido: soma as quantidades.
  update pedido_itens a
     set qtd = a.qtd + b.qtd,
         qtd_recebida = case when a.qtd_recebida is null and b.qtd_recebida is null then null
                             else coalesce(a.qtd_recebida, 0) + coalesce(b.qtd_recebida, 0) end,
         qtd_conf_colab = case when a.qtd_conf_colab is null and b.qtd_conf_colab is null then null
                               else coalesce(a.qtd_conf_colab, 0) + coalesce(b.qtd_conf_colab, 0) end
    from pedido_itens b
   where a.produto_id = p_para and b.produto_id = p_de and a.pedido_id = b.pedido_id;
  delete from pedido_itens b where b.produto_id = p_de
     and exists (select 1 from pedido_itens a where a.produto_id = p_para and a.pedido_id = b.pedido_id);
  update pedido_itens set produto_id = p_para where produto_id = p_de;
  get diagnostics n = row_count; v_resumo := v_resumo || jsonb_build_object('pedidos', n);

  -- Fornecedores que vendem: o duplicado traz os dele.
  delete from fornecedor_produto b where b.produto_id = p_de
     and exists (select 1 from fornecedor_produto a where a.produto_id = p_para and a.fornecedor_id = b.fornecedor_id);
  update fornecedor_produto set produto_id = p_para where produto_id = p_de;
  get diagnostics n = row_count; v_resumo := v_resumo || jsonb_build_object('fornecedores', n);

  -- CMV manual: valor soma.
  update cmv_compras_manual a set valor = a.valor + b.valor
    from cmv_compras_manual b
   where a.produto_id = p_para and b.produto_id = p_de and a.contagem_id = b.contagem_id;
  delete from cmv_compras_manual b where b.produto_id = p_de
     and exists (select 1 from cmv_compras_manual a where a.produto_id = p_para and a.contagem_id = b.contagem_id);
  update cmv_compras_manual set produto_id = p_para where produto_id = p_de;

  -- Notas (e o que a nota aprendeu), etiquetas.
  update nota_itens set produto_id = p_para where produto_id = p_de;
  get diagnostics n = row_count; v_resumo := v_resumo || jsonb_build_object('notas', n);
  update etiqueta_itens set produto_id = p_para where produto_id = p_de;
  update etiquetas set produto_id = p_para where produto_id = p_de;

  -- O duplicado sai de cena (fica no banco, desativado, apontando pro que ficou).
  update produtos set ativo = false, mesclado_em = p_para where id = p_de;
  update produtos set ativo = true where id = p_para and not ativo;

  return jsonb_build_object('ok', true, 'de', v_de.nome, 'para', v_para.nome, 'resumo', v_resumo);
end;
$function$;
revoke all on function public.mesclar_produtos(uuid, uuid) from public, anon;
grant execute on function public.mesclar_produtos(uuid, uuid) to authenticated;

-- Consumo médio (Contagem → Consumo) soma as entradas das notas: idem, com a
-- permissão Contagem.
CREATE OR REPLACE FUNCTION public.consumo_periodos(p_desde date)
 RETURNS TABLE(produto_id uuid, ini timestamp with time zone, fim timestamp with time zone, qtd_ini numeric, qtd_fim numeric, entrou numeric, consumo numeric, dias numeric, fator_suspeito numeric, nota_suspeita uuid, maior_contagem numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with dia as (
    -- última contagem de cada dia, por produto (itens "precisa comprar?" não têm quantidade)
    select distinct on (ci.produto_id, c.data)
           ci.produto_id, c.criado_em, ci.qtd_estoque as qtd
    from contagem_itens ci
    join contagens c on c.id = ci.contagem_id
    where c.status = 'finalizada'
      and c.empresa_id = (select public.empresa_atual())
      and (select public.tem_permissao('contagem'))
      and ci.precisa_comprar is null
      and c.data >= p_desde - 45
      and c.criado_em::date <= c.data + 2
    order by ci.produto_id, c.data, c.criado_em desc
  ),
  maior as (
    select d.produto_id, max(d.qtd) as qtd from dia d group by d.produto_id
  ),
  par as (
    select d.produto_id,
           lag(d.criado_em) over w as ini,
           d.criado_em as fim,
           lag(d.qtd) over w as qtd_ini,
           d.qtd as qtd_fim
    from dia d
    window w as (partition by d.produto_id order by d.criado_em)
  ),
  -- Entradas do período todo, numa passada só (por intervalo era 10× mais lento).
  ent as (
    select ni.produto_id, nf.entrada_em as t, nf.id as nota_id, ni.qtd,
      case
        when coalesce(ni.fator, 1) > 1 then ni.fator
        when upper(coalesce(ni.unidade, '')) in ('CX','CXA','FD','FDO','PCT','PC','SC','ENG','DZ','PACK','CJ')
             and coalesce(pr.fardo, 0) > 0
          then pr.fardo
        else 1
      end as f
    from nota_itens ni
    join notas_fiscais nf on nf.id = ni.nota_id
    join produtos pr on pr.id = ni.produto_id
    where ni.destino is null
      and nf.empresa_id = (select public.empresa_atual())
      and nf.entrada_em >= (p_desde - 46)
      and coalesce(nf.situacao, '') <> 'cancelada'
  ),
  ped as (
    select pi.produto_id, pe.criado_em as t, coalesce(pi.qtd_recebida, pi.qtd) as q
    from pedido_itens pi
    join pedidos pe on pe.id = pi.pedido_id
    where pe.criado_em >= (p_desde - 46)
      and pe.empresa_id = (select public.empresa_atual())
      and pe.criado_em::date <= pe.data + 2
  ),
  pares as (
    select * from par p where p.ini is not null and p.fim > p.ini and p.fim::date >= p_desde
  ),
  por_nota as (
    select p.produto_id, p.fim, sum(e.qtd * e.f) as q, max(e.f) as f_max,
           (array_agg(e.nota_id order by e.f desc))[1] as nota_f
    from pares p join ent e on e.produto_id = p.produto_id and e.t > p.ini and e.t <= p.fim
    group by p.produto_id, p.fim
  ),
  por_pedido as (
    select p.produto_id, p.fim, sum(e.q) as q
    from pares p join ped e on e.produto_id = p.produto_id and e.t > p.ini and e.t <= p.fim
    group by p.produto_id, p.fim
  ),
  com_entrada as (
    select p.*, greatest(coalesce(n.q, 0), coalesce(d.q, 0)) as entrou, n.f_max, n.nota_f, m.qtd as maior_qtd,
           (m.qtd > 0 and n.f_max > 5 * m.qtd) as fora
    from pares p
    left join por_nota n on n.produto_id = p.produto_id and n.fim = p.fim
    left join por_pedido d on d.produto_id = p.produto_id and d.fim = p.fim
    left join maior m on m.produto_id = p.produto_id
  )
  select c.produto_id, c.ini, c.fim, c.qtd_ini, c.qtd_fim, c.entrou,
         c.qtd_ini + c.entrou - c.qtd_fim as consumo,
         round(extract(epoch from (c.fim - c.ini)) / 86400.0, 2) as dias,
         case when c.fora then c.f_max end as fator_suspeito,
         case when c.fora then c.nota_f end as nota_suspeita,
         c.maior_qtd as maior_contagem
  from com_entrada c;
$function$;
revoke all on function public.consumo_periodos(date) from public, anon;
grant execute on function public.consumo_periodos(date) to authenticated;

notify pgrst, 'reload schema';
