-- Clientes, fiado, cashback, Pix, cartão, vales, compras internas e
-- entregadores por módulo (auditoria SEC-04, fase B, lote 3, Onda 3).
--
-- Antes qualquer login da empresa lia, gravava e apagava (até o do quiosque
-- da balança, o garçom, a recepção e o rodízio). Agora cada tabela abre só pra
-- quem tem o módulo que a usa (o dono tem tudo). A "Compra da equipe" no
-- caixa/PDV/delivery e o saldo devedor mostrado no caixa passaram a ir pelo
-- servidor — esse código vai pro ar ANTES desta migration.
--
-- As funções do cashback (security definer) e as do vale-presente (chamadas
-- só por quem tem Salão/PDV) seguem como estão.

-- clientes: Salão, PDV, Delivery, Financeiro
drop policy if exists clientes_empresa on public.clientes;
drop policy if exists clientes_auth on public.clientes;
drop policy if exists clientes_modulo on public.clientes;
create policy clientes_modulo on public.clientes for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv')) or (select public.tem_permissao('delivery')) or (select public.tem_permissao('financeiro'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv')) or (select public.tem_permissao('delivery')) or (select public.tem_permissao('financeiro'))));

-- cliente_fiado: Salão, PDV, Delivery
drop policy if exists cliente_fiado_empresa on public.cliente_fiado;
drop policy if exists cliente_fiado_auth on public.cliente_fiado;
drop policy if exists cliente_fiado_modulo on public.cliente_fiado;
create policy cliente_fiado_modulo on public.cliente_fiado for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv')) or (select public.tem_permissao('delivery'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv')) or (select public.tem_permissao('delivery'))));

-- cashback_config: Delivery, PDV
drop policy if exists cashback_config_empresa on public.cashback_config;
drop policy if exists cashback_config_auth on public.cashback_config;
drop policy if exists cashback_config_modulo on public.cashback_config;
create policy cashback_config_modulo on public.cashback_config for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('delivery')) or (select public.tem_permissao('pdv'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('delivery')) or (select public.tem_permissao('pdv'))));

-- cashback_mov: Delivery, PDV
drop policy if exists cashback_mov_empresa on public.cashback_mov;
drop policy if exists cashback_mov_auth on public.cashback_mov;
drop policy if exists cashback_mov_modulo on public.cashback_mov;
create policy cashback_mov_modulo on public.cashback_mov for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('delivery')) or (select public.tem_permissao('pdv'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('delivery')) or (select public.tem_permissao('pdv'))));

-- pix_cobrancas: Salão, PDV, Delivery
drop policy if exists pix_cobrancas_empresa on public.pix_cobrancas;
drop policy if exists pix_cobrancas_auth on public.pix_cobrancas;
drop policy if exists pix_cobrancas_modulo on public.pix_cobrancas;
create policy pix_cobrancas_modulo on public.pix_cobrancas for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv')) or (select public.tem_permissao('delivery'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv')) or (select public.tem_permissao('delivery'))));

-- tef_transacoes: Salão, PDV, Delivery
drop policy if exists tef_transacoes_empresa on public.tef_transacoes;
drop policy if exists tef_transacoes_auth on public.tef_transacoes;
drop policy if exists tef_transacoes_modulo on public.tef_transacoes;
create policy tef_transacoes_modulo on public.tef_transacoes for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv')) or (select public.tem_permissao('delivery'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv')) or (select public.tem_permissao('delivery'))));

-- tef_status: Salão, PDV, Delivery
drop policy if exists tef_status_empresa on public.tef_status;
drop policy if exists tef_status_auth on public.tef_status;
drop policy if exists tef_status_modulo on public.tef_status;
create policy tef_status_modulo on public.tef_status for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv')) or (select public.tem_permissao('delivery'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv')) or (select public.tem_permissao('delivery'))));

-- vales_presente: Salão, PDV
drop policy if exists vales_presente_empresa on public.vales_presente;
drop policy if exists vales_presente_auth on public.vales_presente;
drop policy if exists vales_presente_modulo on public.vales_presente;
create policy vales_presente_modulo on public.vales_presente for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv'))));

-- vales_presente_usos: Salão, PDV
drop policy if exists vales_presente_usos_empresa on public.vales_presente_usos;
drop policy if exists vales_presente_usos_auth on public.vales_presente_usos;
drop policy if exists vales_presente_usos_modulo on public.vales_presente_usos;
create policy vales_presente_usos_modulo on public.vales_presente_usos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv'))));

-- retiradas: Compras internas, Colaboradores, Notas Fiscais
drop policy if exists retiradas_empresa on public.retiradas;
drop policy if exists retiradas_auth on public.retiradas;
drop policy if exists retiradas_modulo on public.retiradas;
create policy retiradas_modulo on public.retiradas for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('retiradas')) or (select public.tem_permissao('colaboradores')) or (select public.tem_permissao('notas'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('retiradas')) or (select public.tem_permissao('colaboradores')) or (select public.tem_permissao('notas'))));

-- retirada_produtos: Compras internas
drop policy if exists retirada_produtos_empresa on public.retirada_produtos;
drop policy if exists retirada_produtos_auth on public.retirada_produtos;
drop policy if exists retirada_produtos_modulo on public.retirada_produtos;
create policy retirada_produtos_modulo on public.retirada_produtos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('retiradas'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('retiradas'))));

-- entregador_acertos: Delivery
drop policy if exists entregador_acertos_empresa on public.entregador_acertos;
drop policy if exists entregador_acertos_auth on public.entregador_acertos;
drop policy if exists entregador_acertos_modulo on public.entregador_acertos;
create policy entregador_acertos_modulo on public.entregador_acertos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('delivery'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('delivery'))));

-- entregador_fechamentos: Delivery
drop policy if exists entregador_fechamentos_empresa on public.entregador_fechamentos;
drop policy if exists entregador_fechamentos_auth on public.entregador_fechamentos;
drop policy if exists entregador_fechamentos_modulo on public.entregador_fechamentos;
create policy entregador_fechamentos_modulo on public.entregador_fechamentos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('delivery'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('delivery'))));

-- entregador_posicoes: Delivery
drop policy if exists entregador_posicoes_empresa on public.entregador_posicoes;
drop policy if exists entregador_posicoes_auth on public.entregador_posicoes;
drop policy if exists entregador_posicoes_modulo on public.entregador_posicoes;
create policy entregador_posicoes_modulo on public.entregador_posicoes for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('delivery'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('delivery'))));

notify pgrst, 'reload schema';
