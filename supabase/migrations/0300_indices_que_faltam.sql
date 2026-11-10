-- Índices que faltam (auditoria DES-003 / SEC-18, Onda 4 — velocidade).
--
-- Com uma empresa só, o índice por empresa_id aponta pra todas as linhas e o
-- banco filtra o resto uma por uma: contar as comandas de um dia percorria as
-- 6 mil comandas (a tela inicial faz isso 8 vezes), achar os itens de uma nota
-- percorria os 3 mil itens (431 mil vezes em 82 dias). São tabelas pequenas:
-- criar leva menos de um segundo.

-- Comandas por dia (tela inicial, buffet, fechamentos).
create index if not exists pdv_comandas_empresa_aberta_idx on public.pdv_comandas (empresa_id, aberta_em);

-- Itens da nota e o histórico de compra de cada produto (contagem, consumo, CMV).
create index if not exists nota_itens_nota_idx on public.nota_itens (nota_id);
create index if not exists nota_itens_produto_idx on public.nota_itens (produto_id) where produto_id is not null;
create index if not exists pedido_itens_produto_idx on public.pedido_itens (produto_id);
create index if not exists contagem_itens_produto_idx on public.contagem_itens (produto_id);

-- Contas a pagar e conciliação.
create index if not exists lancamentos_nota_idx on public.lancamentos (nota_id) where nota_id is not null;
create index if not exists lancamentos_fornecedor_idx on public.lancamentos (fornecedor_id) where fornecedor_id is not null;
create index if not exists lancamentos_categoria_idx on public.lancamentos (categoria_id);
create index if not exists transacoes_banco_lancamento_idx on public.transacoes_banco (lancamento_id) where lancamento_id is not null;

-- Cotação, ponto, cardápio e etiquetas.
create index if not exists cotacao_precos_produto_idx on public.cotacao_precos (produto_id);
create index if not exists cotacao_precos_fornecedor_idx on public.cotacao_precos (fornecedor_id);
create index if not exists ponto_batidas_colaborador_idx on public.ponto_batidas (colaborador_id, data) where colaborador_id is not null;
create index if not exists pdv_comanda_itens_item_idx on public.pdv_comanda_itens (item_id) where item_id is not null;
create index if not exists etiquetas_produto_idx on public.etiquetas (produto_id) where produto_id is not null;

-- Repetido (SEC-19): idx_lancamentos_competencia é igual a idx_lancamentos_data.
drop index if exists public.idx_lancamentos_competencia;

analyze public.pdv_comandas, public.nota_itens, public.pedido_itens, public.contagem_itens, public.lancamentos,
  public.transacoes_banco, public.cotacao_precos, public.ponto_batidas, public.pdv_comanda_itens, public.etiquetas;
