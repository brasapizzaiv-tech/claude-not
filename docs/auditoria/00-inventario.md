# Etapa 0: preparação e inventário

30/10/2026 · versão no ar `a663b81` · só leitura (nenhum código, banco ou deploy alterado)

## Resumo

- **149 telas** e **36 rotas de API/arquivo**. Também **7 crons** na Vercel, **1 webhook** (WhatsApp), **3 agentes locais** (impressão + relógio de ponto, balança, TEF), **2 apps nativos** (Entregador e Equipe), o site estático, o app das marmitas e uma extensão do Chrome.
- **Banco**: Postgres 17.6, 159 tabelas, **62 MB**, em São Paulo (`sa-east-1`). A Vercel também está em São Paulo (`gru1`). Os dois estão na mesma região, então a distância não explica lentidão.
- O banco é pequeno: a maior tabela (`notas_emitidas`) tem 24 mil linhas e 7,6 MB. Se alguma tela demora, a causa provável é o **número de idas ao banco e a ordem delas**, não o volume de dados. Isso ainda precisa ser medido na Etapa 1.
- `pg_stat_statements` está ligado e acessível, com estatística acumulada desde 10/08/2026.
- **Pendências conhecidas**: 4 resolvidas, 3 continuam e 1 está pela metade (seção 5).
- **Não existe ambiente de teste.** O `.env.local` aponta pro mesmo banco da produção, e o token da Focus NFe mora no banco. A seção 3 propõe um caminho seguro, e a seção 4 traz as perguntas que precisam de resposta antes da Etapa 1.

---

## 1. Mapa de rotas

Gerado por `node scripts/auditoria/mapa-rotas.mjs`, que lê `src/app` e aplica a mesma regra de permissão do middleware (`src/lib/permissoes.ts`).

**Quem acessa:**
- **Dono**: só o papel dono.
- **Perm. X**: logado com a permissão X em Usuários. O dono sempre passa.
- **Qualquer logado**: qualquer funcionário com login.
- **Link**: link pessoal com token, sem login.
- **Público**: qualquer pessoa.
- **TV**: chave na URL.
- **Agente**: token do agente instalado no PC.
- **Cron**: Vercel Cron com `CRON_SECRET`.

⚠ marca o que vai ser olhado de perto na Etapa 5.

### Início e administração

| Rota | Quem acessa | O que faz |
|---|---|---|
| `/login` | Público | Entrada do painel (e-mail e senha) |
| `/dashboard` | Qualquer logado | Tela inicial: faturamento do dia (dia/noite), caixa atual, mesas, avisos |
| `/aparencia` | Dono (checado na página) | Cores e logo da empresa |
| `/usuarios` | Dono | Usuários do painel e permissões por módulo |
| `/formas-pagamento` | Dono (checado na página) | Cadastro das formas de pagamento |
| `/fiscal` | Qualquer logado ⚠ | Configuração fiscal NF-e/NFC-e. As ações exigem Financeiro, a página não |
| `/fiscal/perfis` | Qualquer logado ⚠ | Perfis fiscais (NCM/CFOP/CSOSN) por categoria |
| `/impressao` | Perm. impressao | Central de impressões: impressoras, fila, agente |
| `/sistema` | Qualquer logado | Página antiga com as "fases" do sistema. Parece sem uso |

### Salão, caixa, PDV e cozinha

| Rota | Quem acessa | O que faz |
|---|---|---|
| `/salao` | Perm. salao | Mapa das mesas e comandas abertas |
| `/salao/mesa/[mesa]` | Perm. salao | Comandas de uma mesa |
| `/salao/comandas/[id]` | Perm. salao | Comanda: itens, lançar, fechar |
| `/salao/caixa` | Perm. salao | Frente de caixa: abrir, receber, sangria, fechar |
| `/salao/caixa/movimentos` | Perm. salao | Movimentações do caixa |
| `/salao/caixa/movimentos/[id]` | Perm. salao | Detalhe de um recebimento |
| `/salao/caixa/fechamentos` | Perm. salao | Histórico de fechamentos de caixa |
| `/salao/caixa/sangrias` | Perm. salao | Sangrias e a categoria de cada uma |
| `/salao/caixa/pix` | Perm. salao | Pix recebidos (Sicoob) |
| `/salao/caixa/tef` | Perm. salao | Transações de cartão TEF por período |
| `/salao/caixa/fiado` | Perm. salao | Fiado de clientes |
| `/salao/caixa/cortesias` | Perm. salao | Cortesias e vales |
| `/salao/caixa/vales` | Perm. salao | Vales-presente com código |
| `/salao/cancelados` | Perm. salao | Itens e comandas cancelados ou excluídos |
| `/salao/cardapio` | Perm. salao | Cardápio do salão e do delivery: itens, categorias, preços, número de mesas |
| `/salao/cardapio/adicionais/[itemId]` | Perm. salao | Adicionais de um item |
| `/salao/cardapio/combos/[id]` | Perm. salao | Montagem de combo em etapas |
| `/salao/notas-fiscais` | Perm. salao | NFC-e emitidas |
| `/salao/notas-fiscais/avulsa` | Perm. salao | Emitir NF-e/NFC-e avulsa |
| `/salao/balanca` | Perm. salao | Leitor da balança e comandas de buffet |
| `/salao/balanca/quiosque` | Perm. salao | Quiosque da balança (tela do PC da balança) |
| `/pdv` | Perm. pdv | PDV de balcão |
| `/garcom` | Perm. garcom ou salao, ou link do garçom | App do garçom: mesas e histórico |
| `/garcom/mesa/[mesa]` | idem | Mesa no app do garçom |
| `/garcom/comanda/[id]` | idem | Lançar itens na comanda |
| `/garcom-avulso/[token]` | Link | Garçom avulso (freelancer) |
| `/cozinha` | Perm. rodizio | Quadro do rodízio no tablet da cozinha |
| `/cozinha/recados` | Perm. rodizio | Recados que aparecem na TV |
| `/cozinha/relatorio` | Perm. rodizio | Relatório do rodízio |
| `/tv` | TV | TV da cozinha: fila do rodízio, cardápio, recados, feriados |
| `/balanca-teste` | Público | Prova de conceito da balança pela porta serial. Parece sem uso |

### Delivery e clientes

| Rota | Quem acessa | O que faz |
|---|---|---|
| `/delivery` | Perm. delivery | Quadro de pedidos do delivery |
| `/delivery/novo` | Perm. delivery | Novo pedido pelo painel |
| `/delivery/[id]` | Perm. delivery | Detalhe do pedido |
| `/delivery/areas` | Perm. delivery | Áreas e taxas de entrega no mapa |
| `/delivery/entregadores` | Perm. delivery | Entregadores |
| `/delivery/entregadores/acerto` | Perm. delivery | Acerto dos entregadores |
| `/delivery/entregadores/caixa` | Perm. delivery | Caixa dos motoboys |
| `/delivery/cupons` | Perm. delivery | Cupons |
| `/delivery/cashback` | Perm. delivery | Cashback |
| `/delivery/campanhas` | Perm. delivery | Campanhas de WhatsApp |
| `/delivery/campanhas/nova` | Perm. delivery | Nova campanha |
| `/delivery/campanhas/[id]` | Perm. delivery | Uma campanha |
| `/delivery/gatilhos` | Perm. delivery | Mensagens automáticas |
| `/delivery/whatsapp` | Perm. delivery | Modelos e limites do WhatsApp |
| `/delivery/config` | Perm. delivery | Configuração do delivery e conexão do WhatsApp |
| `/delivery/vitrine` | Perm. delivery | Vitrine do app do cliente |
| `/delivery/relatorios` | Perm. delivery | Relatórios do delivery |
| `/delivery/kern` | Perm. delivery | Marmitas da Kern |
| `/clientes` | Qualquer logado ⚠ | Cadastro de clientes (telefone, endereço) |
| `/pedir` | Público | Cardápio e pedido online do cliente |
| `/pedir/acompanhar/[id]` | Público (id do pedido) | Acompanhar o pedido |
| `/entrega` | Público | Tela de entrada do app Motelli Entregador |
| `/entrega/[token]` | Link | App do entregador: entregas e rota |

### Compras, estoque, notas e etiquetas

| Rota | Quem acessa | O que faz |
|---|---|---|
| `/fornecedores` | Perm. fornecedores | Fornecedores ativos e inativos |
| `/produtos` | Perm. produtos | Produtos (tamanhos, mesclar, preço de referência) |
| `/categorias` | Perm. produtos | Categorias de produto |
| `/contagens` | Perm. contagem | Contagens de estoque |
| `/contagens/[id]` | Perm. contagem | Uma contagem |
| `/contagens/[id]/atribuir` | Perm. contagem | Dividir a contagem entre pessoas |
| `/contagens/agendamentos` | Perm. contagem | Contagens agendadas |
| `/contagens/consumo` | Perm. contagem | Consumo médio do estoque |
| `/contar/[token]` | Link | Contagem pelo celular |
| `/cotacoes` | Perm. cotacoes | Cotações |
| `/cotacoes/[id]` | Perm. cotacoes | Uma cotação |
| `/cotacoes/[id]/fornecedores` | Perm. cotacoes | Escolher fornecedores e mandar o link |
| `/cotacoes/[id]/comparar` | Perm. cotacoes | Comparar preços e escolher |
| `/cotacoes/[id]/pedidos` | Perm. cotacoes | Pedidos gerados pela cotação |
| `/cotar/[token]` | Link (fornecedor) | Fornecedor responde a cotação |
| `/cotar/escolher` | Link (fornecedor) | Fornecedor escolhe a empresa |
| `/conferencia` | Perm. conferencia | Conferência de entregas |
| `/conferencia/novo` | Perm. conferencia | Nova conferência |
| `/conferencia/[id]` | Perm. conferencia | Uma conferência (pedido × nota) |
| `/conferencia/divergencias` | Perm. conferencia | Divergências e relatório |
| `/notas` | Perm. notas | Notas fiscais de entrada |
| `/notas/[id]` | Perm. notas | Uma nota: itens, vínculo com produto, lançar |
| `/notas/sefaz` | Perm. notas | Busca automática na SEFAZ |
| `/etiquetas` | Perm. etiquetas | Etiquetas de validade |
| `/etiquetas/[id]` | Perm. etiquetas | Uma etiqueta |
| `/etiquetas/itens` | Perm. etiquetas | Itens e categorias de etiqueta |
| `/etiquetas/impressas` | Perm. etiquetas | Etiquetas impressas por período |
| `/etiquetas/scanner` | Perm. etiquetas | Leitor de QR da etiqueta |
| `/e/[id]` | Público (id da etiqueta) ⚠ | Etiqueta aberta pelo QR: ver e dar baixa |

### Financeiro

| Rota | Quem acessa | O que faz |
|---|---|---|
| `/financeiro` | Perm. financeiro | Lançamentos |
| `/financeiro/contas` | Perm. contas ou financeiro | Contas a pagar |
| `/financeiro/banco` | Perm. financeiro | Conciliação bancária (OFX) |
| `/financeiro/fatura` | Perm. financeiro | Fatura do cartão |
| `/financeiro/dre` | Perm. financeiro | DRE |
| `/financeiro/orcamento` | Perm. financeiro | Orçamento × real |
| `/financeiro/cmv` | Perm. financeiro | CMV real |
| `/financeiro/vendas` | Perm. financeiro | Notas emitidas × faturamento |
| `/financeiro/vendidos` | Perm. financeiro | Produtos vendidos |
| `/financeiro/buffet` | Perm. financeiro | Buffet livre × quilo |
| `/financeiro/categorias` | Perm. financeiro | Categorias do DRE |
| `/financeiro/caixa` | Perm. financeiro | Fechamentos de caixa do financeiro |
| `/financeiro/caixa/novo` | Perm. financeiro | Novo fechamento |
| `/financeiro/caixa/[id]` | Perm. financeiro | Um fechamento |
| `/cofre` | Perm. cofre | Cofre do dinheiro em espécie |

### Equipe

| Rota | Quem acessa | O que faz |
|---|---|---|
| `/colaboradores` | Perm. colaboradores | Lista mestre de colaboradores e horários |
| `/colaboradores/[id]` | Perm. colaboradores | Ficha do funcionário |
| `/colaboradores/cadastros` | Perm. colaboradores | Cadastros |
| `/colaboradores/semana` | Perm. colaboradores | Semana: presença e 10% |
| `/colaboradores/assiduidade` | Perm. colaboradores | Assiduidade |
| `/colaboradores/ponto` | Perm. colaboradores | Ponto: visão geral |
| `/colaboradores/ponto/diario` | Perm. colaboradores | Ponto diário |
| `/colaboradores/ponto/espelhos` | Perm. colaboradores | Espelhos de ponto |
| `/colaboradores/ponto/horarios` | Perm. colaboradores | Horários de trabalho |
| `/colaboradores/ponto/horarios/[id]` | Perm. colaboradores | Editar um horário |
| `/colaboradores/ponto/regras` | Perm. colaboradores | Justificativas e inconsistências |
| `/colaboradores/ponto/relatorios` | Perm. colaboradores | Relatórios do ponto |
| `/folgas` | Perm. folgas | Gestão de folgas |
| `/retiradas` | Perm. retiradas | Compras internas (fiado da equipe) |
| `/solicitacoes` | Perm. solicitacoes | Pedidos de compra e manutenção da equipe |
| `/checklists` | Perm. checklists | Checklists de hoje |
| `/checklists/modelos` | Perm. checklists | Modelos de checklist |
| `/checklists/revisao` | Perm. checklists | Revisar checklists |
| `/checklists/historico` | Perm. checklists | Histórico |
| `/checklists/apontamentos` | Perm. checklists | Pontos de atenção |
| `/lembretes` | Perm. lembretes | Lembretes pra equipe |
| `/eu/[token]` | Link | App da equipe: início (avisos, lembretes, conferência do dia) |
| `/eu/[token]/cardapio` | Link | Montar o cardápio do dia (quem faz o cardápio) |
| `/eu/[token]/checklist` | Link | Checklists do setor |
| `/eu/[token]/compras` | Link | Pedir compra ou manutenção |
| `/eu/[token]/contas` | Link | Contas a pagar (quem tem a marcação) |
| `/eu/[token]/documentos` | Link | Meus documentos |
| `/eu/[token]/etiqueta` | Link | Nova etiqueta |
| `/eu/[token]/etiqueta/vencimentos` | Link | Vencimentos |
| `/eu/[token]/baixa` | Link | Dar baixa em etiqueta |
| `/eu/[token]/pagamentos` | Link | Meus pagamentos (10%, adiantamentos, compras) |
| `/eu/[token]/ponto` | Link | Meu ponto e assinatura do espelho |
| `/eu/[token]/rodizio` | Link | Lançar pedido do rodízio |
| `/folga/[token]` | Link | Minhas folgas |

### Cardápio do dia, reservas, mural e eventos

| Rota | Quem acessa | O que faz |
|---|---|---|
| `/cardapio-do-dia` | Perm. cardapio_dia | Editor do cardápio do dia (buffet e marmitas) |
| `/reservas` | Perm. reservas | Reservas |
| `/reservas/hoje` | Perm. recepcao | Reservas de hoje no celular |
| `/feriados` | Perm. feriados | Feriados e eventos marcados |
| `/mural` | Perm. mural | Mural do escritório |
| `/tv/mural` | TV | Mural na TV do escritório |

### Site do restaurante e marca

| Rota | Quem acessa | O que faz |
|---|---|---|
| `/` e `/site` | Público | Site do restaurante (`public/site/index.html`, estático) |
| `/cardapio` | Público | Redireciona pro cardápio dentro do site |
| `/marmitas` | Público | App das marmitas do convênio (`public/marmitas.html`, estático) |
| `/motelli` | Público | Site da marca Motelli (pelo domínio motelli.com.br) |
| `/motelli/privacidade` | Público | Política de privacidade |

### Rotas de API e arquivos

| Rota | Quem chama | O que faz |
|---|---|---|
| `/api/versao` | Público | Qual versão está no ar (toda tela pergunta) |
| `/api/cardapio` | Público | Cardápio do dia pro site |
| `/api/reservas` | Público | Reserva vinda do site |
| `/api/marmitas/[[...rota]]` | Público. O dono logado é o administrador | API do app das marmitas |
| `/api/entrega/identidade` | Público | Responde ao app do entregador que aqui roda um sistema nosso |
| `/api/equipe/identidade` | Público | Idem, pro app da equipe |
| `/api/entrega/ativar` | Público, com código de entrada | Troca o código pelo link do entregador |
| `/api/equipe/ativar` | Público, com código de entrada | Troca o código pelo link do funcionário |
| `/api/rastreio` | Entregador (token como identificador) | Posição do entregador em segundo plano (formato Traccar) |
| `/api/impressao/fila` | Agente | Documentos esperando impressão |
| `/api/impressao/documento/[id]` | Agente | Gera o documento (PDF/ESC-POS) de um item da fila |
| `/api/impressao/baixa` | Agente | Marca como impresso |
| `/api/impressao/heartbeat` | Agente | Sinal de vida e lista de impressoras |
| `/api/balanca/pesagem` | Agente da balança | Pesagem vira comanda de buffet |
| `/api/balanca/status` | Agente da balança | Sinal de vida e fila offline |
| `/api/tef/status` | Agente TEF | Sinal de vida do TEF de cada caixa |
| `/api/ponto/batidas` | Agente | Batidas do relógio de ponto |
| `/api/tv/fila` | TV | Fila do rodízio, cardápio e recados pra TV |
| `/api/tv/camera` | Chave da TV | Aviso da câmera do buffet (câmera desativada desde 21/10) |
| `/api/whatsapp/webhook` | Meta (assinatura conferida) | Status das mensagens enviadas |
| `/auth/signout` | Logado | Sair |
| `/financeiro/contas/export` | Perm. contas ou financeiro | Exporta as contas a pagar pra contabilidade |
| `/eu/[token]/garcom` | Link + PIN | Liga o modo garçom no app pessoal |
| `/manifest.webmanifest`, `/garcom.webmanifest`, `/pedir.webmanifest` | Público | Ícone e nome do app ao "adicionar à tela de início" |
| `/eu/[token]/manifest.json`, `/entrega/[token]/manifest.webmanifest` | Link | Manifesto por pessoa |
| `/motelli/google…html` | Público | Prova de propriedade do domínio no Google |

**Crons** (`vercel.json`; a Vercel usa horário UTC, aqui convertido pra Brasília):

| Rota | Quando | O que faz |
|---|---|---|
| `/api/sefaz/cron` | de hora em hora | Busca notas novas na SEFAZ |
| `/api/sefaz/completar` | a cada 5 min | Completa as notas encontradas (baixa o XML) |
| `/api/contagem/cron` | a cada 15 min | Dispara as contagens agendadas |
| `/api/whatsapp/disparos` | a cada 5 min | Campanhas e gatilhos do WhatsApp |
| `/api/kern/delivery` | 08:35, seg a sáb | Pedido automático das marmitas da Kern |
| `/api/equipe/avisos` | 08:00, todo dia | Resumo da manhã no celular da equipe |
| `/api/entrega/limpar` | 04:20, todo dia | Apaga posições de entregador com mais de 90 dias |

---

## 2. O que roda fora do navegador

| Peça | Onde roda | Como fala com o sistema |
|---|---|---|
| **Agente de impressão** v1.2.0 (`agente-impressao/`, instalador em `installer-impressao/`) | PC central | Pergunta a fila a cada 3 s enquanto há impressão e a cada 10 s quando está parado. Manda sinal de vida a cada 60 s. Imprime pelo nome da impressora no Windows |
| **Relógio de ponto** (`agente-impressao/ponto.mjs`) | Mesmo PC central | Lê o AFD do Control iD (192.168.1.129) a cada N minutos e manda as batidas pra `/api/ponto/batidas` |
| **Agente da balança** (`agente-balanca/`) | PC da balança | Lê a Urano POP-31 na serial e serve o peso em `localhost:8543`. Sem internet, guarda as pesagens numa fila local e tenta de novo sem parar. Imprime o cupom na térmica do PC |
| **Agente TEF** (`agente-tef/`) | Cada PC de caixa com pinpad | `localhost:8544`. Troca arquivos IntPos com o Elgin TEF Hub, só confirma o cartão depois que a venda gravou e desfaz se não gravar |
| **App Motelli Entregador** (`app-entregador/`, Capacitor) | Celular do entregador | Abre `/entrega/[token]` e usa GPS |
| **App Motelli Equipe** (`app-equipe/`, Capacitor) | Celular da equipe | Abre `/eu/[token]` e recebe avisos pelo Firebase (FCM) |
| **Site do restaurante** (`public/site/`, 740 KB, 11 imagens) | Navegador do cliente, estático | Lê `/api/cardapio` e grava em `/api/reservas` |
| **App das marmitas** (`public/marmitas.html`, 933 linhas) | Navegador, estático | `/api/marmitas` |
| **Extensão do Chrome** "Brasa WhatsApp Sender" 1.1.0 (`extensao-whatsapp/`) | Chrome do escritório | Envio em massa da cotação pelo WhatsApp Web |
| **7 crons** | Vercel | Tabela acima |
| **Webhook** | Vercel | Só o do WhatsApp (Meta). O Pix Sicoob é **consultado** (`consultarCobrancaPix`), não avisa. A Focus NFe também é consultada |
| **Banco** | Supabase | Avisa a TV pelo Realtime (canal privado, gatilho `pedidos_rodizio_avisar_tv`). **Não** tem pg_cron nem Edge Functions |

**Serviços externos que o servidor chama:**
- Focus NFe (produção e homologação)
- Sicoob Pix
- Meta Graph (WhatsApp)
- Firebase FCM
- Google Maps (geocodificação e distância)
- Nominatim/OpenStreetMap (geocodificação reserva e mapa)
- BrasilAPI (CEP e CNPJ)
- Open-Meteo (temperatura na TV)

**Fora do escopo:**
- `app-teimofit-aluno/` e `app-teimofit-professor/`: são do TeimoFit (Plataforma de Treinos), só moram nesta pasta.
- Câmera do buffet: desativada desde 21/10.

---

## 3. Ambiente para testar sem mexer na produção

### Como está hoje

- Só existe a produção. O `.env.local` aponta pro **mesmo banco** do sistema no ar. Não tem Supabase local, nem branch, nem projeto de teste. Docker e Supabase CLI não estão instalados.
- **Um servidor local NÃO é seguro hoje.** O token da Focus NFe e o CSC estão gravados no banco (`config_fiscal`), não em variável de ambiente. Um `next dev` ligado na produção que clicasse em "emitir" emitiria nota de verdade. Pix e WhatsApp, por outro lado, ficam desligados no local: as chaves estão só na Vercel, e a tabela `whatsapp_conta` está vazia.
- **Algumas telas gravam no banco só de serem abertas:**

| Tela | O que grava ao abrir | Efeito |
|---|---|---|
| `/cotacoes`, `/cotacoes/[id]` | `cotacoes_fechar_vencidas`: fecha as cotações com prazo vencido | Repete o que qualquer abertura faria |
| `/cotacoes/[id]/fornecedores` | O mesmo, e **também convida os fornecedores "sempre"** (insere linhas e marca a cotação) | Cria dado novo |
| `/cotar/[token]` | `cotar_fornecedor_prazo`: fecha a cotação se o prazo venceu | Repete o que qualquer abertura faria |
| `/pedir`, `/delivery/novo` | `garantirMarmitasDeHoje`: sincroniza as opções das marmitas do dia | Repete o que o 1º cliente do dia já faz |
| `/colaboradores/semana` | `sincronizarDezDoCaixa`: puxa o 10% do caixa | Repete o que qualquer abertura faria |

### Proposta

**Etapas 1 e 3, parte visual: medir na própria produção, só abrindo páginas.** A lentidão que importa é a da produção: Vercel e Supabase em São Paulo, com os dados reais. Quatro travas:

1. **Robô Playwright usando o Chrome já instalado, com bloqueio de gravação no próprio navegador.** Toda requisição POST, PUT, PATCH ou DELETE pro sistema ou pra Supabase é cortada antes de sair. Toda server action é POST, então nenhum botão consegue gravar. As funções do banco que só leem passam: são as que o `scripts/auditoria/rpcs-que-gravam.mjs` marca como "lê".
2. **As telas da tabela acima ficam fora**, a menos que você libere as que só repetem o que qualquer abertura já faz.
3. **Fora do horário de serviço.** São umas 450 aberturas de página em ~40 min. A carga é desprezível: o banco tem 62 MB, e cada abertura é uma chamada na Vercel, como um clique seu.
4. **Usuários de teste criados por você.** Eu não crio conta nem digito senha:
   - `auditoria.dono` (dono), pra abrir todas as telas
   - `auditoria.func` (só Garçom), pra testar "funcionário em tela de dono"
   - Um **colaborador "Teste Auditoria"** e um **entregador "Teste Auditoria"** no painel, pros links `/eu`, `/folga`, `/contar` e `/entrega`

   O robô abre uma janela e você digita a senha uma vez. A sessão fica num arquivo na pasta temporária do Claude, **fora do repositório**, e é apagada no fim da auditoria. O token do colaborador de teste eu leio do banco (só leitura) e nunca escrevo em lugar nenhum. Pra `/tv`, você cola o link da TV nessa mesma janela.

**Etapa 3, cliques e formulários** (salvar, duplo clique, erro do servidor, 500 itens). Isso grava, então não pode ser na produção. Duas opções:

- **A (recomendo)**: um **projeto Supabase separado**, "motelli-teste", que você cria no painel da Supabase (o plano gratuito serve, o banco tem 62 MB).
  - Eu aplico as 273 migrations e copio os dados da produção (só leitura) **com telefone, CPF, endereço e nome de clientes embaralhados**.
  - `config_fiscal`, Pix e WhatsApp ficam sem token: nada sai pro mundo real.
  - O servidor local aponta pra esse projeto.
  - Custo zero, meio dia de trabalho meu.
- **B**: sem projeto de teste. A Etapa 3 faz só o que não grava: prints, console, layout, perfil errado, abrir modal e cancelar, falha de rede simulada no navegador. Formulários, duplo clique e erro do servidor ficam como "verificado por leitura".

**Etapas 2, 4, 5 e 6** são leitura de código e banco em só leitura. Não precisam de ambiente.

---

## 4. Ferramentas

| Ferramenta | Situação | O que falta |
|---|---|---|
| Chrome 156 e Edge 156 | Instalados | Nada |
| Playwright | Não está no projeto nem instalado globalmente | `playwright-core` (poucos MB, **não baixa navegador**: usa o Chrome instalado), instalado só em `scripts/auditoria/`, com `package.json` próprio e `node_modules` fora do git |
| Lighthouse | Não instalado | `lighthouse` (algumas dezenas de MB), no mesmo lugar. Só nas 5 a 10 telas principais. Pra tabela geral, o próprio Playwright mede tempo de resposta, LCP e requisições |
| Celular com 4G simulado | O Playwright faz pelo protocolo do Chrome | Nada |
| `pg_stat_statements` | **Ligado e acessível**: 4.798 consultas e 13.692 s acumulados desde 10/08/2026 | Nada |
| `EXPLAIN` sem ANALYZE | Possível, em sessão só leitura | Nada |
| `tsc`, `eslint`, `next build` | No projeto | Nada |
| Tempo das funções na Vercel | Sem a CLI da Vercel (o `vercel env pull` foi bloqueado antes) | Opcional: um print da aba "Observability" do painel da Vercel ajudaria a cruzar os números. Não é obrigatório |
| Docker / Supabase CLI / psql | Não instalados | Não precisa: os scripts usam o `pg` do próprio projeto, e o projeto de teste (opção A) dispensa Docker |

---

## 5. Pendências conhecidas

| # | Pendência | Estado | Evidência |
|---|---|---|---|
| 1 | `cardapio_itens.usos` somando a cada salvamento | **Resolvida** | `recalcularUsos` (`src/lib/cardapio-dia-core.ts:206`) recalcula do zero pelos dias **publicados** e só roda na publicação (`:160`). Sobra menor: lê `cardapio_dia` inteiro sem paginação (passa de 1000 dias por volta de 2029) e grava item por item |
| 2 | "M" no nome do prato marcando marmita | **Resolvida** | Marcação explícita ao lado de cada prato (coluna `marmitas`, migrations 0264/0265, regra em `src/lib/marmitas-marcas.ts`). Nenhum teste de "M" no nome sobrou |
| 3 | `MESAS_MAX = 46` fixo | **Continua** | `src/lib/rodizio.ts:24`, usado no rodízio do app da equipe (`src/app/eu/[token]/rodizio/form.tsx:27` e `rodizio-actions.ts:64`). O resto do sistema usa `pdv_config.qtd_mesas` (padrão 40, editável em `/salao/cardapio`): são duas fontes pro mesmo número |
| 4 | Leitura do cardápio da TV duplicada em `rodizio-server.ts` | **Resolvida** | `cardapioTv` (`src/lib/rodizio-server.ts:136`) usa `montarCardapioDia`, a mesma regra do resto. Só o comentário da linha 133 ficou velho (ainda diz "a TV pergunta a cada 3 s") |
| 5 | Semana da rotação da Kern em dois lugares | **Continua** | `semanaPara` e `segundaDe` estão em `src/lib/marmitas-cardapio.ts:47` e `:59` (com o comentário "copiada aqui") e em `src/app/api/marmitas/[[...rota]]/route.ts:110` e `:125` |
| 6 | Policies `authenticated USING (true)` e SECURITY DEFINER sem login | **Continua** | 2 policies `USING (true)` pra qualquer logado: `colaboradores` e `profiles`. **45 funções SECURITY DEFINER, todas executáveis sem login** (anon), entre elas `cashback_creditar_venda`, `cashback_resgatar`, `pdv_reiniciar_numeracao`, `gerar_contagem_agendada`, `wpp_candidatos` e `cliente_compras`. O que cada uma confere por dentro fica pra Etapa 5. **Se alguma não conferir, é crítico**: a chave anon está no navegador de qualquer cliente do `/pedir`. Ponto positivo: RLS ligada em 159 de 159 tabelas |
| 7 | Quiosque da balança com cores cruas | **Pela metade** | Nenhuma cor hex na tela (as 4 que existem são do cupom impresso, o que é permitido). Mas `src/app/(painel)/salao/balanca/quiosque/quiosque.tsx` ainda tem cerca de 27 classes de cor crua do Tailwind (`text-red-600`, `text-amber-700`, `bg-green-500`, `bg-amber-100`…) no lugar das etiquetas `pilula-*` |
| 8 | TV atualizando a cada 3 s | **Resolvida** | A TV recebe o aviso do banco pelo Realtime (canal privado) e só pergunta por segurança a cada 30 s (fila) e 5 min (resto): `src/app/tv/tv-client.tsx:21-22`, `:90-91` e `:116` |

---

## 6. Observações que já apareceram (viram itens nas etapas certas)

Ainda não são achados no formato padrão, porque nenhuma foi medida ou verificada a fundo.

- **[Etapa 1]** Cada clique no painel passa por:
  1. **middleware**: `getUser()`, que é uma ida ao servidor de login da Supabase, e mais a consulta de `profiles` nas rotas de módulo;
  2. **layout do painel**: repete o `getUser()` e o `profiles`, consulta `empresas` e faz mais 2 contagens (reservas e pedidos da equipe), **uma depois da outra**.

  É o candidato mais forte a lentidão em todas as telas. Falta medir.
- **[Etapa 1]** `/dashboard` tem 17 consultas no arquivo da página, `/pedir` tem 14, `/garcom/mesa/[mesa]` tem 15. Falta medir quantas vão em fila.
- **[Etapa 2]** `src/middleware.ts`: no Next 16.3 o nome `middleware` está obsoleto e virou `proxy` (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`).
- **[Etapa 2]** Possíveis sobras: `/sistema`, `/balanca-teste`, `/api/rastreio` (formato Traccar, mas o rastreio passou pro app nativo; falta confirmar se ainda é usado) e `/api/tv/camera`.
- **[Etapa 2]** São 273 arquivos de migration pra numeração até 0269: os números 0081, 0082, 0083 e 0084 aparecem duas vezes. Falta conferir se o banco tem as duas de cada.
- **[Etapa 5]** `/fiscal` e `/fiscal/perfis` abrem pra qualquer funcionário logado: a página não confere nada, só as ações exigem Financeiro. E o token da Focus e o CSC estão em `config_fiscal`. Falta ver se a policy dessa tabela deixa qualquer logado ler.
- **[Etapa 5]** `/clientes` abre pra qualquer funcionário logado, com telefone e endereço de todos os clientes.
- **[Etapa 5]** `/e/[id]` (etiqueta pelo QR) é pública, e `etiqueta_baixa_scan` pode ser chamada sem login. A proteção é o id ser impossível de adivinhar. Avaliar.
- **[Etapa 6]** `/api/sefaz/cron`: o comentário diz "1x por dia", mas o `vercel.json` roda de hora em hora. Conferir contra a regra de consumo indevido da SEFAZ (rejeição 656).
