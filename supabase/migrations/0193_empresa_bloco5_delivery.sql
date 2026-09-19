-- ETAPA 2 DO MULTIEMPRESA — bloco 5: delivery e pagamentos
--
-- Cada linha destas tabelas passa a ter dono. Duas coisas por tabela:
--
--   1. a coluna `empresa_id`, que já nasce preenchida com a Brasa (é o que
--      `empresa_atual()` responde hoje), então NENHUM dado muda de lugar;
--   2. a regra de leitura e escrita deixa de ser "quem está logado vê tudo" e
--      passa a ser "quem está logado vê o da empresa dele".
--
-- O `with check` é tão importante quanto o `using`: sem ele dá pra LER só o
-- seu e mesmo assim GRAVAR uma linha carimbada com a empresa de outro.
--
-- Atenção: isto protege quem entra com login. Os apps por link (cotação do
-- fornecedor, contagem da equipe) falam com o banco pela chave administrativa,
-- que passa por cima destas regras — lá o filtro é no código, e vai junto
-- neste mesmo commit.

-- delivery_areas (0 linhas)
alter table public.delivery_areas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists delivery_areas_empresa_idx on public.delivery_areas (empresa_id);
drop policy if exists "delivery_areas_auth" on public.delivery_areas;
create policy delivery_areas_empresa on public.delivery_areas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- delivery_config (1 linhas)
alter table public.delivery_config
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists delivery_config_empresa_idx on public.delivery_config (empresa_id);
drop policy if exists "delivery_config_all" on public.delivery_config;
create policy delivery_config_empresa on public.delivery_config for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- delivery_pedidos (2 linhas)
alter table public.delivery_pedidos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists delivery_pedidos_empresa_idx on public.delivery_pedidos (empresa_id);
drop policy if exists "delivery_pedidos_all" on public.delivery_pedidos;
create policy delivery_pedidos_empresa on public.delivery_pedidos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- delivery_promocoes_tele (0 linhas)
alter table public.delivery_promocoes_tele
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists delivery_promocoes_tele_empresa_idx on public.delivery_promocoes_tele (empresa_id);
drop policy if exists "delivery_promocoes_tele_auth" on public.delivery_promocoes_tele;
create policy delivery_promocoes_tele_empresa on public.delivery_promocoes_tele for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- entregador_acertos (0 linhas)
alter table public.entregador_acertos
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists entregador_acertos_empresa_idx on public.entregador_acertos (empresa_id);
drop policy if exists "entregador_acertos_auth" on public.entregador_acertos;
create policy entregador_acertos_empresa on public.entregador_acertos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- entregador_posicoes (20 linhas)
alter table public.entregador_posicoes
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists entregador_posicoes_empresa_idx on public.entregador_posicoes (empresa_id);
drop policy if exists "entregador_posicoes_auth" on public.entregador_posicoes;
create policy entregador_posicoes_empresa on public.entregador_posicoes for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- entregadores (1 linhas)
alter table public.entregadores
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists entregadores_empresa_idx on public.entregadores (empresa_id);
drop policy if exists "entregadores_all" on public.entregadores;
create policy entregadores_empresa on public.entregadores for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- cupons (0 linhas)
alter table public.cupons
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists cupons_empresa_idx on public.cupons (empresa_id);
drop policy if exists "cupons_all" on public.cupons;
create policy cupons_empresa on public.cupons for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- pix_cobrancas (68 linhas)
alter table public.pix_cobrancas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists pix_cobrancas_empresa_idx on public.pix_cobrancas (empresa_id);
drop policy if exists "pix_cobrancas_auth" on public.pix_cobrancas;
create policy pix_cobrancas_empresa on public.pix_cobrancas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- tef_status (0 linhas)
alter table public.tef_status
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists tef_status_empresa_idx on public.tef_status (empresa_id);
drop policy if exists "tef_status_all" on public.tef_status;
create policy tef_status_empresa on public.tef_status for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- tef_transacoes (2 linhas)
alter table public.tef_transacoes
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists tef_transacoes_empresa_idx on public.tef_transacoes (empresa_id);
drop policy if exists "tef_transacoes_all" on public.tef_transacoes;
create policy tef_transacoes_empresa on public.tef_transacoes for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- whatsapp_mensagens (4 linhas)
alter table public.whatsapp_mensagens
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists whatsapp_mensagens_empresa_idx on public.whatsapp_mensagens (empresa_id);
drop policy if exists "whatsapp_mensagens_auth" on public.whatsapp_mensagens;
create policy whatsapp_mensagens_empresa on public.whatsapp_mensagens for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());


-- ---------- A configuração do delivery é UMA POR RESTAURANTE ----------
-- `delivery_config` sempre foi uma linha só, achada por `id = 1` em dez
-- lugares do código. Com dois restaurantes, o segundo precisa da configuração
-- dele: endereço de origem, taxa base, valor por km, horários, se está aberto.
-- Agora existe uma linha por empresa, e quem procura usa a empresa — não o
-- número 1.
create unique index if not exists delivery_config_empresa_key
  on public.delivery_config (empresa_id);

-- ---------- Cupom e terminal repetem entre restaurantes ----------
-- Dois restaurantes podem ter um cupom "PIZZA10", e podem ter um terminal de
-- cartão chamado "CAIXA1".
alter table public.cupons drop constraint if exists cupons_codigo_key;
create unique index if not exists cupons_empresa_codigo_key
  on public.cupons (empresa_id, codigo);

alter table public.tef_status drop constraint tef_status_pkey;
alter table public.tef_status
  add constraint tef_status_pkey primary key (empresa_id, terminal);

-- Três coisas ficam únicas no banco inteiro DE PROPÓSITO:
--   • o token do entregador — é o link pessoal dele, e um link só pode levar
--     a um lugar;
--   • o txid da cobrança Pix — vem do banco e identifica o pagamento;
--   • o acerto do entregador por dia — o entregador já pertence a uma empresa.
