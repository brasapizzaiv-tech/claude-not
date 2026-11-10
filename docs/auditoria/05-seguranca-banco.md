# Etapa 5 — Segurança e banco

Feita em 08/11/2026 (domingo à noite), com a versão `8b9aea9` no ar. Só leitura: código lido, banco consultado em modo
só leitura (`pg_policies`, `pg_proc`, grants, estatísticas), e o que alguém sem login enxerga medido com a chave pública
contando linhas (HEAD/GET, `Range: 0-0`), sem ler conteúdo. Nenhum token, PIN, senha ou certificado foi lido ou
impresso: só tamanho e quantidade. Ninguém tentou entrar de verdade (nada de criar conta, gravar ou forçar senha).
Quatro frentes em paralelo (RLS e multiempresa; funções e chave administrativa; tokens, rotas e permissões; dados
pessoais e banco). Os achados repetidos entre frentes foram juntados; os críticos foram conferidos de novo, à mão.

Repositório público: pessoas e segredos não aparecem aqui, só tabelas, colunas e contagens.

## Resumo

19 grupos de achados: **3 críticos, 6 altos, 9 médios, 1 grupo de baixos**.

O centro do problema: **o banco separa por empresa, mas não por papel**. As permissões do painel existem só nas telas
(`exigirAcesso`, middleware). Pela API do Supabase, com a chave pública que está no navegador, qualquer pessoa logada lê
e grava quase tudo da empresa — e duas tabelas (`profiles`, `colaboradores`) nem filtram empresa. Somado ao cadastro
aberto, isso deixa a porta da internet entreaberta.

**O que já está bem:** quem não tem login não lê nada (158 de 159 tabelas devolvem 0 linhas; só `empresas`, que é
pública de propósito); todas as 159 tabelas têm RLS ligada; os links de cotação e contagem têm tokens fortes (128 bits);
`/pedir` recalcula preço, taxa e cupom no servidor; o webhook do WhatsApp confere a assinatura com comparação segura;
TV e mural recusam sem chave; não há CPF real nem csv/xlsx no git (862 commits varridos).

**Para conter já (urgente):**
1. **SEC-02** — o Rafael desliga o cadastro aberto no painel do Supabase.
2. **SEC-01** — **corrigido em 08/11** (migration 0276): perfil não muda papel/permissões/empresa; colaboradores presos
   à empresa.

| Severidade | Achados |
|---|---|
| Crítico | SEC-01, SEC-02, SEC-03 |
| Alto | SEC-04 a SEC-09 |
| Médio | SEC-10 a SEC-18 |
| Baixo | SEC-19 (vários) |

---

### [SEC-01] Qualquer pessoa logada se promove a dono
- Severidade: **crítico** (achado pelas quatro frentes; conferido à mão)
- Onde: `profiles`, policy `acesso_autenticado` = `ALL to authenticated using (true) with check (true)` (de
  `0001_init.sql`); `authenticated` tem UPDATE em `papel`, `permissoes` e `empresa_id`; nenhum gatilho protegendo.
  `colaboradores` tem a mesma regra (de `0005`). A 0185 pôs `empresa_id` nas duas e não trocou a regra.
- O que alguém consegue fazer: com o próprio login e a chave pública, grava `papel = 'dono'` no próprio perfil pela
  API. A partir daí o painel o trata como dono (`permissoes-server.ts`, middleware, `garantirDono` em `usuarios/actions.ts`),
  passa no `sou_dono()` e lê o token da Focus e o CSC (derruba a correção da 0275), troca a senha do dono de verdade e
  apaga usuários. Também lê e altera os colaboradores de qualquer empresa.
- Evidência: `pg_policies` e grants; 10 contas hoje (3 dono, 7 funcionário), todas no padrão das criadas em Usuários —
  nenhum sinal de que alguém já tenha usado.
- **Corrigido em 08/11 21h36 (OK do Rafael; migration 0276).** Provado como o funcionário, em transação desfeita no
  fim: virar dono e mudar permissões → recusado; mexer no perfil do dono → 0 linhas; trocar o próprio tema, ler os 10
  perfis e os 54 colaboradores → funciona. O robô com o login do funcionário passou nas 99 telas sem diferença.
- Correção aplicada (`supabase/migrations/0276_perfis_e_colaboradores_protegidos.sql`): perfil lê o
  próprio e os da mesma empresa, muda só a própria linha e nunca papel/permissões/empresa/id (gatilho que recusa quando
  quem grava é `authenticated`/`anon`; a tela Usuários grava pela chave administrativa e passa); `colaboradores` por
  empresa. Conferido no código: todas as gravações de papel/permissões já usam a chave administrativa; o resto só lê o
  próprio perfil ou os da empresa, e o tema grava só na própria linha.
- Esforço: P · Risco: baixo

### [SEC-02] O cadastro de contas está aberto, e a conta nova cai na Brasa
- Severidade: **crítico**
- Onde: configuração do Auth (`/auth/v1/settings` devolve `disable_signup: false`; e-mail precisa ser confirmado) e a
  função `handle_new_user`, que põe o perfil na empresa do `raw_user_meta_data.empresa_id` (que quem se cadastra
  escolhe) ou, sem isso, em `empresa_atual()` — hoje, a Brasa.
- O que alguém consegue fazer: um estranho chama o cadastro com a chave pública, confirma o próprio e-mail e vira
  funcionário logado da Brasa: lê e grava as tabelas da empresa (SEC-04) e, com o SEC-01, vira dono. Não testado (criar
  conta está fora do permitido); a prova é a configuração e o código.
- Correção: **o Rafael desliga** em Supabase → Authentication → Sign In / Providers → Email → "Allow new users to sign
  up" (os usuários nascem por `admin.createUser` na tela Usuários, que não depende disso). Depois, `handle_new_user`
  aceitar a empresa só de convite (`raw_app_meta_data`).
- Esforço: P · Risco: baixo

### [SEC-03] Certificado digital A1 e a senha dele legíveis e trocáveis por qualquer login
- Severidade: **crítico**
- Onde: `config_sefaz` (colunas `cert_pfx` e `cert_senha`, senha em texto), policy só por empresa;
  `notas/sefaz-actions.ts:20` (`salvarConfigSefaz`) sem checagem de permissão.
- O que alguém consegue fazer: baixar o e-CNPJ (que serve pra SEFAZ e, segundo o projeto, pro Pix Sicoob) com a senha e
  assinar em nome da empresa; ou trocar o certificado.
- Evidência: 1 linha, `cert_pfx` com 5.096 caracteres e `cert_senha` com 9 (só medidos).
- Correção: só o dono lê/grava (mesmo modelo da 0275) e `exigirAcesso` na ação; a tela `/notas/sefaz` passa a receber só
  "tem certificado: sim". Guardar a senha fora de coluna legível. Regra da casa "nunca tocar no certificado": mexer só na
  permissão, não no arquivo; trocar a senha é decisão do Rafael.
- Esforço: P · Risco: médio
- **CORRIGIDO 08/11 (~23h, OK do Rafael):** commit cd0dfbd + migration 0277 (RLS de `config_sefaz` só do dono). O
  servidor lê o certificado pela chave administrativa, filtrado pela empresa, depois de `exigirAcesso("/notas")`;
  `/notas/sefaz` e salvar o certificado entraram no SO_DONO; o botão "SEFAZ automático" some pra quem não é dono.
  Conferido com o login do funcionário: 0 linhas de `config_sefaz` pela API, `/notas/sefaz` → início, `/notas` abre.
  O arquivo e a senha do certificado não foram tocados (a senha segue em coluna de texto, agora só o dono lê).

### [SEC-04] A RLS não distingue funcionário de dono: quase tudo aberto pra qualquer login
- **Fase A corrigida em 10/11/2026 (Onda 3):** token dos agentes e config das marmitas só do dono; token/PIN/código de colaboradores e entregadores sem SELECT pra sessão (migration 0292). **Fase B, lote 1 (10/11, migrations 0294/0295):** dados pessoais da equipe (CPF, RG, PIS, CTPS, CNH, endereço, telefone, nascimento, pais, tipo sanguíneo, filhos, salário/diária) só pela visão `colaboradores_dados` (permissão Colaboradores). Correção da 0292 na 0293 (geradores de código). **Lote 2 (10/11 ~14h, migration 0296):** 39 tabelas da equipe e do dinheiro por módulo (`tem_permissao`), arquivos de atestado/documento só com Colaboradores, `mesclar_produtos`/`consumo_periodos` definer. **Lote 3 (10/11 ~16h15, migration 0298):** clientes, fiado, cashback, Pix, TEF, vales, compras internas e entregadores por módulo; "Compra da equipe" grava pelo servidor. **SEC-04 FECHADO.**
- Severidade: **alto**
- Onde: 149–151 tabelas com a mesma regra `ALL to authenticated using/check (empresa_id = empresa_atual())`.
- O que alguém consegue fazer pela API, com qualquer login (até o do quiosque da balança):
  - equipe: salário, CPF, RG, PIS, endereço, pagamentos da semana, adiantamentos, ponto, atestados (dado de saúde);
  - `colaboradores.token`, `pin` e `codigo` (35 PINs) → entra no `/eu` de qualquer pessoa;
  - `impressao_config.token` (o token dos agentes) → forja batida de ponto em `/api/ponto/batidas` e lê a fila;
  - `mkt_config` (senhas do app das marmitas);
  - clientes (3,3 mil), financeiro, notas, Pix, TEF — e pode apagar.
- Correção: curto prazo, policies só do dono (`sou_dono()`) em `config_sefaz`, `impressao_config`, `mkt_config` e nas
  colunas token/pin/codigo de `colaboradores` (view ou grant por coluna); depois, `tem_permissao('modulo')` nas tabelas de
  dinheiro e equipe, conferindo tela por tela o que lê com a sessão do usuário.
- Esforço: G · Risco: médio

### [SEC-05] PIN de 4 dígitos sem limite de tentativas, em texto, e código de entrada de 6 dígitos
- Severidade: **alto**
- Onde: `entrarPin` (`eu/[token]/actions.ts:107`), RPC `colaborador_home` (a anon chama), `api/equipe/ativar`,
  `api/entrega/ativar`, `src/lib/ativacao-codigo.ts`.
- O que acontece: com o token, os 10 mil PINs saem em minutos pela RPC (nada conta erro); o cookie `eu_{token}` guarda
  o próprio PIN por 180 dias; 8 ativos estão sem PIN (quem tem o token cria o PIN e tranca o dono). O código de 6 dígitos
  (54 colaboradores, 7 entregadores, sem validade) tem limite de 10 erros por IP e 300 no total a cada 15 min: com vários
  IPs, ~1 acerto esperado por dia; o teto global ainda deixa o atacante travar a ativação de todo mundo.
- Correção: contador de erro por token no banco (5 erros → trava 15 min) nas RPCs `colaborador_*`; PIN com hash; cookie
  com valor assinado; código de uso único ou que expira, 8+ caracteres.
- Esforço: M · Risco: médio
- **PARTE CORRIGIDA 08/11 (~23h30, OK do Rafael):** migration 0278 + commit 73c95a4. `colab_pin_ok(token, pin)`:
  5 erros seguidos travam a pessoa por 15 min (mesmo com o PIN certo), acerto zera. As 7 funções `colaborador_*`
  e as 13 comparações do servidor no `/eu` passam por ela (`src/lib/pin-colaborador.ts`); a tela avisa "Espere 15
  minutos". Achado junto e fechado: **PIN nulo passava** (`v_pin <> null` dá null e o `if` não barrava) — a anon
  chamava `colaborador_home(token, null)` e entrava. Ensaio em transação desfeita 11/11; em produção as telas
  pedem PIN e PIN vazio/nulo é recusado sem contar erro.
- **Resto CORRIGIDO 09/11 (~01h, OK do Rafael; commits 4e73dc6 + a605d4a, migrations 0279/0280, ensaio 20/20):**
  - PIN embaralhado: `colaboradores.pin` = `h1:` + HMAC-SHA256 com pimenta em `privado.colab_pin_pimenta` (esquema
    que a API não enxerga); os 35 PINs viraram hash. Ler a tabela não revela o PIN nem deixa testar os 10 mil.
  - Celular sem o PIN: cookie `eu_{token}` = chave de acesso `s1.<64 hex>` (`colab_criar_sessao`, só o hash em
    `privado.colab_sessoes`); cookie antigo troca sozinho na tela inicial (`RenovarAcesso`); "Sair deste aparelho"
    invalida a chave; zerar/trocar PIN, desligar ou trocar o link derrubam as chaves (gatilho). Com a chave válida a
    pessoa entra mesmo se alguém travou o PIN dela de propósito.
  - Código de ativação: continua 6 números (os apps das lojas só aceitam isso), mas vale UMA vez e por 7 dias
    (`codigo_ate`); os de hoje ganharam 7 dias; painéis mostram "Gerar código". De 61 códigos válidos pra sempre
    → só os de quem está instalando.
  - Modo garçom: cookie que não confere (PIN mudou) renova pelo `/eu/{token}/garcom`; avulso vencido não entra em ciclo.
- **SEC-05 FECHADO.** Fica de observação: o `token` dos colaboradores ainda é legível por qualquer login da empresa
  (SEC-04); com ele + PIN (agora limitado a 5 tentativas/15 min) entra-se no `/eu`.
- **Achado novo, CORRIGIDO 08/11 (~00h, OK do Rafael, commit fab38ef):** o cookie `garcom_colab` do modo garçom
  guardava só o token, sem o PIN: quem tinha o link de um garçom montava o cookie e usava o app do garçom. Agora é
  `token.assinatura` (HMAC no servidor, `src/lib/garcom-assinatura.ts`, amarrado ao PIN atual; testes 4/4). Cookie
  antigo renova sozinho pelo `/eu/{token}/garcom` (que confere o PIN do app). Em produção: só o token → manda
  renovar → sem o PIN do app volta pro `/eu` com "garcom=negado"; assinatura inventada → login.

### [SEC-06] App das marmitas: senha numérica em texto, sem limite, e lista pública de funcionários do Kern
- **Corrigido em 10/11/2026 (Onda 3, lote 2).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **alto**
- Onde: `api/marmitas/[[...rota]]/route.ts:200-208, 317-322` (login), `:261-271` (`/api/publico`).
- O que acontece: 3 contas com senha só de dígitos (6, 6 e 4), em texto em `mkt_config`, mandada no cabeçalho a cada
  chamada, sem limite de tentativas; a de 4 dígitos tem todas as permissões (usuários, cardápio, pedidos). E
  `GET /api/publico` devolve a qualquer um nome e matrícula de até 117 funcionários do Kern (dado pessoal de terceiros).
- Correção: login pelo sistema (permissão própria) ou hash + limite; tirar a matrícula da resposta pública (o colaborador
  escolhe o nome; a matrícula confere no servidor).
- Esforço: M · Risco: baixo

### [SEC-07] Fotos da cotação: a pasta pública revela os tokens dos fornecedores e aceita qualquer arquivo
- **Corrigido em 10/11/2026 (Onda 3, lote 1).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **alto**
- Onde: bucket `cotacao-fotos` (`public = true`, sem limite de tamanho nem de tipo), policies de SELECT e INSERT pra
  `anon`; `cotar/[token]/preencher.tsx:254,269` grava em `{token}/...`.
- O que acontece: com a chave pública, qualquer pessoa lista a pasta e ganha os tokens (12 das 13 subpastas são
  `cotacao_fornecedores.token`) → abre `/cotar/{token}`, vê os preços e muda a resposta enquanto a cotação está aberta. E
  sobe arquivo de qualquer tamanho/tipo (hospedagem grátis).
- Evidência: 97 arquivos, 364 MB, ~4,3 MB por dia desde 17/08 (1 GB do plano grátis em ~5 meses).
- Correção: tirar o SELECT da anon (o endereço público da foto continua funcionando); nome aleatório em vez do token;
  envio por endereço assinado gerado no servidor depois de validar o token; 2 MB e só `image/*`; comprimir no celular.
- Esforço: M · Risco: baixo

### [SEC-08] `/pedir` confia no telefone digitado
- Severidade: **alto** (já anotado como DEL-13 na Etapa 4; aqui com o resto)
- Onde: `pedir/actions.ts:28-47` (`dadosClientePublico`), `:50-85` (`meusPedidos`), `:267-345` (envio do pedido).
- O que alguém consegue fazer, sabendo (ou varrendo) um telefone: ver nome, último endereço e histórico de pedidos com
  os links de acompanhamento; fazer pedido de retirada com `usarCashback` e gastar o saldo da pessoa; sobrescrever o
  endereço e o aceite de promoções no cadastro dela. Sem limite de tentativas nem filtro de empresa.
- Correção: código de confirmação pelo WhatsApp (ou cookie do aparelho que já pediu) antes de mostrar endereço ou usar
  cashback; pedido não confirmado só preenche o cadastro vazio; limite por IP.
- Esforço: M · Risco: médio

### [SEC-09] Cashback criado do nada: as funções aceitam qualquer logado e valor livre
- Severidade: **alto** (cashback está desligado hoje; vira prejuízo quando ligar)
- Onde: `cashback_creditar_venda`, `cashback_resgatar(_ref)`, `cashback_estornar_*`, `cashback_saldo` (SECURITY DEFINER,
  só `exigir_logado()`); `pdv/actions.ts:194-204` calcula a base com `preco × qtd` vindos do navegador.
- O que alguém consegue fazer: qualquer login chama `cashback_creditar_venda(cliente, comanda, 99999)` pela API e dá
  crédito sem limite a um conhecido; estorna ou resgata o saldo de qualquer cliente. No PDV, preço inflado na tela infla o
  cashback ganho (o total cobrado vem do banco, a base não).
- Correção: a função calcula a base pelos itens da comanda no banco e recusa comanda já creditada ou de outra empresa;
  só o servidor chama (`exigir_servidor`); no PDV, base pelos itens do banco.
- Esforço: M · Risco: baixo

### [SEC-10] As funções do app da equipe mexem em qualquer pedido de compra
- **Corrigido em 10/11/2026 (Onda 3, lote 2).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: médio
- Onde: `colaborador_remove_item`, `_add_item`, `_conferir_pedido`, `_responder_entrega`, `_pedidos`.
- Qualquer colaborador ativo (com token + PIN, ou só o token pros 19 sem PIN) apaga qualquer `pedido_itens` por id,
  muda quantidade conferida e marca "recebido/não veio" em qualquer pedido; `colaborador_pedidos` devolve ids de todas as
  empresas. Correção: remover só o item que o próprio colaborador criou, exigir a caixinha de quem confere, filtrar
  empresa. Esforço M.

### [SEC-11] Ações do painel sem checagem de permissão no servidor
- **Corrigido em 10/11/2026 (Onda 3, lote 1).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: médio (anônimo não alcança; qualquer login, sim)
- Além das já conhecidas (`contagens`, `conferencia`, `cotacoes`): `salao/actions.ts` (preços e cardápio, configuração do
  PDV, comandas, `*Kiosk` com peso sem teto), `delivery/actions.ts` (**`definirPagoDelivery`**, status, entregador,
  cupons, configuração; `criarPedidoDelivery` aceita desconto maior que o subtotal → total negativo),
  `financeiro/cmv/actions.ts` (**faturamento do dia**, CMV), `financeiro/vendas/actions.ts` (importar faturamento),
  `notas/sefaz-actions.ts` (certificado e manifestação), `produtos/actions.ts` (inclui **mesclar**), `fornecedores`,
  `etiquetas`, `impressao`, `reservas`, `categorias`, `contagens/agendamentos`. `finalizarVendaPdv` aceita acesso de
  garçom sem pedir `/pdv`. `emitirNfceComandasAdmin` e `imprimirNfceAdmin` são exportadas de arquivo `"use server"`
  (viram endpoint; hoje inofensivas, mas devem ir pra `src/lib`).
- Correção: `exigirAcesso` em cada uma (mesmo padrão de 08/11); desconto entre 0 e o subtotal; peso entre 0 e ~5 kg.
- Esforço: M · Risco: baixo

### [SEC-12] Segredos que, se faltarem, deixam a porta aberta
- **Corrigido em 10/11/2026 (Onda 3, lote 1).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: médio (vira alto se faltar na Vercel)
- As 7 rotinas (`contagem/cron`, `sefaz/cron`, `sefaz/completar`, `whatsapp/disparos`, `kern/delivery`,
  `equipe/avisos`, `entrega/limpar`) usam `if (secret && …)` e aceitam `?key=` na URL (vai pros logs); o webhook do
  WhatsApp só confere a assinatura se `WHATSAPP_APP_SECRET` existir. Sem as variáveis: qualquer um dispara campanhas de
  WhatsApp, o pedido do Kern, as rotinas SEFAZ, e forja "SAIR" (descadastra clientes; `wpp_marcar_sair` casa pelos
  últimos 8 dígitos).
- Evidência: o `.env.local` não tem `CRON_SECRET` nem `WHATSAPP_APP_SECRET`; a produção não dá pra ver daqui.
- Correção: **o Rafael confere na Vercel** que existem; depois `if (!secret || …)` → 401, webhook recusa sem segredo,
  tirar o `?key=`.
- Esforço: P · Risco: baixo

### [SEC-13] Link de contagem antigo reescreve contagem finalizada e aceita qualquer produto
- **Corrigido em 09/11/2026 (Onda 1 da correção).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: médio (= EST-03 da Etapa 4, agora com mais detalhe)
- `contar_salvar` não olha o status nem as categorias do link: 36 dos 39 links apontam pra contagem finalizada e não
  expiram; o link aceita qualquer produto ativo (de outra categoria e de outra empresa). Muda o CMV de semanas passadas.
  Correção: recusar finalizada; limitar aos produtos das categorias do link e à empresa. Esforço P.

### [SEC-14] Multiempresa: o que vai vazar quando entrar a segunda empresa
- Severidade: médio hoje (alto no dia da segunda empresa)
- Tabelas: 156 têm `empresa_id` com FK e 153 com default `empresa_atual()`; toda tabela criada depois da 0175 seguiu a
  regra; só `profiles` e `colaboradores` ficaram sem a policy por empresa (SEC-01).
- `/usuarios` lista e altera usuários de qualquer empresa só pelo id (`usuarios/page.tsx:22-23`, `actions.ts:74, 88, 101`):
  o dono da B troca a senha do dono da A.
- Funções que recebem a empresa de quem chama (`cliente_compras`, `wpp_publico`, `wpp_candidatos`) e `cashback_*` sem
  conferir empresa.
- Chave administrativa sem filtro de empresa: app do entregador (pedidos prontos de todas), etiquetas e vencimentos do
  `/eu`, folgas, rodízio do `/eu`, SEFAZ (`config_sefaz .limit(1)`), WhatsApp (última `whatsapp_conta`), fila de NFC-e,
  delivery público, cardápio do dia, `mkt_pedidos`; inserts sem `empresa_id` explícito (garçom por cookie,
  `delivery-core.ts:356`).
- Correção: guardar o `empresa_id` do dono do token/sessão e aplicar em todo `.from()` com a chave administrativa (um
  `adminDaEmpresa(id)`); nas funções, exigir `p_empresa = empresa_atual()` quando quem chama é `authenticated`.
- Esforço: M · Risco: médio

### [SEC-15] O banco depende de uma camada só: anon tem permissão em tudo
- **Corrigido em 10/11/2026 (Onda 3, lote 3).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: médio
- anon tem SELECT/INSERT/UPDATE/DELETE nas 159 tabelas e EXECUTE nas 77 funções (default privileges da 0208 e o
  `grant ... to anon` no fim de cada rodada do `scripts/migrate.mjs`, que ainda desfaz qualquer `revoke` futuro — inclusive
  o da 0275 em `sou_dono`). Hoje a RLS segura (anon lê 0 linhas), mas uma tabela criada sem `enable row level security`
  vira CRUD público na hora.
- Correção: revogar de anon o que não é público (deixar `empresas` e as RPCs por token); fazer o `migrate.mjs` falhar se
  alguma tabela do public estiver sem RLS e parar de re-grantar tudo.
- Esforço: M · Risco: médio (testar os apps por link)

### [SEC-16] LGPD: a exclusão prometida não existe, e apagar colaborador apaga registro que a lei manda guardar
- **CORRIGIDO 10/11/2026 ~17h35 (migration 0299, commit a27431e).** Decisões do Rafael: cliente que pede é anonimizado
  (`anonimizar_cliente`; Clientes → Remover), colaborador com histórico só desligado (12 FKs RESTRICT), nada automático.
  Quanto tempo cada dado fica: nota fiscal e registros de pagamento pelo prazo da lei (5 anos); ponto, acertos e
  atestados enquanto a lei trabalhista mandar; o resto até a pessoa pedir. Posições do entregador: 90 dias (já existia).
- Severidade: médio
- A política de privacidade (`src/app/motelli/privacidade/page.tsx:85`) promete apagar cadastro, mensagens e posições em
  até 15 dias; `excluirCliente` só marca `ativo = false` e telefone/endereço continuam em `delivery_pedidos`,
  `whatsapp_mensagens`, `nfce_pendentes`, `reservas`, `vales_presente`, `eventos`. Do lado da equipe é o contrário: apagar
  um colaborador apaga em cascata `ponto_assinaturas`, `ponto_fechamentos`, `semana_pagamentos`, `adiantamentos` e
  `atestados`.
- Correção: função `anonimizar_cliente(id)` (troca nome, telefone e endereço por "removido", mantém valores e notas);
  FKs pra `colaboradores` com `restrict` (desligar, nunca apagar); tabela de quanto tempo cada dado fica.
- Esforço: M · Risco: baixo

### [SEC-17] Backup: não dá pra ver daqui
- Severidade: médio até conferir
- Banco 64 MB (46 MB do sistema) e 370 MB de arquivos (quase tudo fotos da cotação, que não entram no backup do banco).
  Não há script de backup no repositório.
- **O Rafael confere** no Supabase: Project Settings → Billing (qual plano) e Database → Backups (backup diário? quantos
  dias? PITR?). Se for o grátis, não há backup pra restaurar: plano Pro (7 dias) ou um `pg_dump` noturno fora do Supabase.
- **Resposta (08/11):** plano Pro, com backup. → resolvido. Fica de observação: o backup diário do Pro guarda 7 dias e
  não cobre as fotos do Storage (cotação); sem PITR, o pior caso é perder até 1 dia de lançamentos.

### [SEC-18] Leitura de tabela inteira em excesso e chaves estrangeiras sem índice
- Severidade: médio (confirma DES-003 e DES-005 da Etapa 1)
- `nota_itens`: 1.366.780 leituras completas, 3,77 bilhões de linhas lidas (consulta `where nota_id = $1`, 431 mil
  chamadas); `notas_fiscais`: 47.837 (consulta da manifestação); `lancamentos`: a consulta mais cara do banco (2.319
  chamadas × 330 ms); `pdv_caixa_mov`: 2.509. 120 FKs sem índice na origem (principais: `lancamentos.nota_id/
  fornecedor_id/categoria_id/fechamento_id`, `nota_itens.nota_id/produto_id`, `cotacao_precos.produto_id/fornecedor_id`,
  `contagem_itens.produto_id`, `ponto_batidas.colaborador_id`, `impressao_fila.impressora_id`).
- Correção: os índices do DES-003 + `nota_itens(nota_id)` + as ~15 FKs com mais linhas, conferidos com `EXPLAIN`.
- Esforço: P · Risco: baixo

### [SEC-19] Baixos
- Índices repetidos: `idx_lancamentos_data` = `idx_lancamentos_competencia`; `_empresa_idx` repetindo `_empresa_key` em
  `balanca_status`, `delivery_config`, `impressao_config`. 47 índices sem uso (quase todos de empresa: manter). Tabela
  velha `cotacao_itens_backup`.
- Dinheiro sem casas fixas: 78 de 103 colunas `numeric` sem escala; `lancamentos.valor` com 63 resíduos de ponto
  flutuante e 3 negativos. 15 colunas de status/tipo sem regra de valores (`pdv_caixas.status`, `pdv_caixa_mov.tipo`,
  `pix_cobrancas.status`, `nfce_emitidas.status`…).
- `impressao_fila` cresce ~147 linhas por dia sem limpeza (3.536 impressas há mais de 30 dias): apagar com mais de 60 dias
  no cron diário que já existe.
- **`app-teimofit-aluno/FICHAS.md:60` tem um celular e um PIN de entrada, no repositório público** — confirmar se é conta
  de teste da loja; se for de pessoa real, tirar e trocar o PIN.
- `ilike` com curinga: garçom avulso (`garcom-avulso/actions.ts:31-38`, assume o cadastro de outro avulso) e cupom
  (DEL-04 da Etapa 4).
- Sem limite de requisições em `api/reservas` POST (lotar a capacidade com reserva falsa), `enviarPedidoPublico` e
  `salvarCarrinhoPublico` (põe telefone de cliente na fila de carrinho abandonado e gera WhatsApp não pedido).
- `pdv_reiniciar_numeracao` qualquer logado chama; `cotar_fornecedor_remover_item` apaga com a cotação fechada; o
  motoboy escolhe "Já pago" com valor 0; `ts`/`peso` do agente da balança sem limite; o token do entregador não troca (só
  desativando); `/api/tef/status` não está no `isPublic` do middleware (o agente pode estar caindo no login — conferir).

## Tabelas sensíveis (resumo)

| Tabela | anon lê? | Quem logado lê/grava hoje | Achado |
|---|---|---|---|
| `profiles` | não | todos, de todas as empresas, e grava papel | SEC-01 |
| `colaboradores` | não | todos, de todas as empresas (salário, CPF, PIN, token) | SEC-01, SEC-04 |
| `config_sefaz` | não | qualquer login (certificado + senha) | SEC-03 |
| `config_fiscal` | não | token e CSC só o dono (0275) | cai com o SEC-01 |
| `impressao_config`, `mkt_config` | não | qualquer login (token dos agentes, senhas das marmitas) | SEC-04, SEC-06 |
| pagamentos da equipe, ponto, atestados, documentos | não | qualquer login | SEC-04 |
| `clientes`, `cliente_fiado`, `cashback_mov` | não | qualquer login | SEC-04, SEC-09 |
| financeiro, notas, Pix, TEF | não | qualquer login, até apagar | SEC-04 |
| `whatsapp_conta`, `tv_camera`, `entrega_ativacao_tentativas` | não | ninguém (só o servidor) | certo |

## Links com token

| Link | Força | Expira? | PIN / limite | Risco |
|---|---|---|---|---|
| `/eu/{token}` | 16 hex (64 bits), 47 | não | PIN 4 dígitos, texto, sem limite; 8 sem PIN | alto (SEC-05) |
| código de entrada (equipe/entregador) | 6 dígitos | não | 10/IP + 300 total por 15 min | alto (SEC-05) |
| `/entrega/{token}` | 24 hex (96 bits), 7 | não (só desativando) | — | baixo |
| `/cotar/{token}` | 32 hex (128 bits), 381 | trava no prazo | — | baixo, mas vaza pela pasta de fotos (SEC-07) |
| `/contar/{token}` | 32 hex, 39 | não; grava em finalizada | — | médio (SEC-13) |
| `/folga/{token}` | o do `/eu` | não | — | baixo |
| `/garcom-avulso/{token}` | 20 hex | às 03:00 | nome com curinga | baixo |
| TV e mural `?chave=` | variável / 32 hex | não | recusa sem chave | baixo |
| marmitas `x-senha` | 3 senhas numéricas (6/6/4) | não | sem limite, texto | alto (SEC-06) |
| agentes (Bearer) | 64 hex (256 bits) | não | legível por qualquer login | médio (SEC-04) |
| etiqueta `/e/{uuid}` | uuid | não | dá baixa sem login | baixo (por desenho) |

## Respostas e conferências (08/11, ~22h)

- **SEC-02: o cadastro aberto foi desligado** pelo Rafael (`/auth/v1/settings` agora devolve `disable_signup: true`).
- As 3 contas dono são conhecidas (Rafael). O `FICHAS.md` do teimofit é conta de teste (Rafael).
- Vercel (lista só de nomes, `vercel env ls`): **`CRON_SECRET` existe** em produção → as rotinas estão protegidas.
  **`WHATSAPP_APP_SECRET` não existe** → o webhook do WhatsApp aceita chamada sem assinatura (SEC-12 vale: dá pra forjar
  "SAIR" e status). Correção: o Rafael pega o "Chave secreta do app" no painel da Meta (app Motelli → Configurações do
  app → Básico) e cola na Vercel como `WHATSAPP_APP_SECRET`; depois o webhook passa a recusar sem assinatura.
- Backup: plano Pro com backup (conferido pelo Rafael em 08/11).

## O que o Rafael precisava conferir (lista original)

1. **Supabase → Authentication → Sign In / Providers → Email → "Allow new users to sign up": desligar.** (SEC-02)
2. Vercel → Settings → Environment Variables: `CRON_SECRET`, `WHATSAPP_APP_SECRET`, `RODIZIO_TV_CHAVE` existem em
   produção? (SEC-12)
3. Supabase → Billing e Database → Backups: plano e backup. (SEC-17)
4. As 3 contas com papel dono (criadas em 10/08, 14/08 e 17/08): são todas conhecidas?
5. `app-teimofit-aluno/FICHAS.md`: o celular e o PIN são de conta de teste? (SEC-19)
