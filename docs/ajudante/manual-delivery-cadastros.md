# Manual: Delivery, cadastros e configurações

## Início (tela inicial, /dashboard)

**Para que serve:** resumo do dia: faturamento, comandas abertas, caixa, salão, delivery, pendências e quem está na casa. Qualquer usuário logado abre. Quem só tem a permissão de recepção cai direto nas reservas de hoje; quem só tem a de garçom, no app do garçom.

**Como fazer:**
1. No campo "Buscar mesa, comanda, cliente…": um número abre a mesa (ex.: 12); número com # abre a comanda (ex.: #318); um nome abre a lista de clientes filtrada.
2. "Ver outro dia" escolhe outra data; "Hoje" volta.
3. No cartão do caixa: "Abrir o caixa", ou "Fechar caixa" e "Sangria" quando já está aberto.

**Regras e avisos:**
- Tudo é do dia escolhido e comparado com o mesmo dia da semana anterior (sexta com sexta).
- "Faturamento do dia" vem dividido em Dia e Noite (a noite começa às 16h). Receber fiado não conta como venda nova.
- "Itens em atraso" soma rodízio parado há mais de 8 minutos, delivery com mais de 45 minutos sem entregar e etiquetas.
- "Precisa de você" mostra delivery atrasado, checklists não concluídos, cotações sem resposta e "Cardápio do dia ainda não publicado", conforme a permissão de cada um.

---

## Delivery (/delivery)

Menu Operação. Precisa da permissão "Delivery".

**Para que serve:** tocar os pedidos de entrega e retirada (app do cliente, WhatsApp, telefone, Instagram, balcão, convênio). Pedido novo do app toca som e aparece na hora.

**Como fazer:**
1. A tela abre em lista. "Ver em quadro" mostra colunas por etapa; "Ver no mapa" mostra pedidos e motoboys.
2. Filtros: "Em andamento", "Novos", "Na cozinha", "Prontos", "Na rua", "Entregues", turno, entrega/retirada e origem. A busca acha número, cliente ou telefone.
3. Som: clique no sino (o navegador só toca depois de um clique na página).
4. Aceitar: escolha o tempo prometido e clique em "Aceitar pedido" (ou "Aceitar" no quadro).
5. O botão principal segue a etapa: "Mandar pra cozinha", "Marcar como pronto", "Saiu para entrega", "Marcar como entregue" (retirada: "Cliente retirou"). "Mudar etapa…" pula direto para qualquer etapa.
6. Motoboy: escolha na caixa de entregador. Não é obrigatório para despachar.
7. "Recusar" ou "Cancelar": o motivo é obrigatório e o cliente vê.
8. "Pedido por telefone" abre o novo pedido. A engrenagem ("Ajustes do delivery") leva a Cardápio, Vitrine do app, Áreas e tele, Cupons, Cashback, Campanhas, pedido automático do convênio de marmitas, Relatórios, Entregadores e Configurações.

**Regras e avisos:**
- Pedido do app imprime na cozinha ao ser aceito; agendado só imprime ao ir para "em preparo".
- "Atrasado" = mais de 45 minutos sem entregar. A numeração recomeça em 1 a cada turno.
- Faixa "pedidos entregues em outros dias ainda não foram recebidos": abra o pedido e use "Receber", ou cancele com o motivo.
- Cancelar pedido já pago pede "Cancelar mesmo assim" e NÃO devolve o dinheiro nem tira a venda do caixa ou do fiado. Pix pelo app se devolve em Caixa → Pix → Estornar. Cancelar devolve o uso do cupom.
- Pedido em "Saldo cliente" (convênio/fiado) entra sozinho no caixa e na conta do cliente ao ser entregue. Se falhar: "Entregue, mas não lançou no caixa…"; use "Receber" depois.

## Pedido aberto (/delivery/[pedido])

**Para que serve:** ver itens, endereço, linha do tempo e últimos pedidos do cliente, e receber o pagamento.

**Como fazer:**
1. "Reimprimir" manda a comanda de novo. "NFC-e" emite a nota (pergunta o CPF; vazio = sem CPF).
2. Receber: aparece "Cliente disse: …" (e o troco, se dinheiro). Escolha a forma (pode ser outra) e clique em "Receber R$ …". Cartão e Pix na maquininha vão pelo pinpad deste computador.
3. "Compra da equipe": escolha o funcionário; vai para Compras internas. Forma que pede código: preencha o código.
4. "desmarcar" tira só a etiqueta de pago; o que entrou no caixa fica.

**Regras e avisos:**
- "O caixa está fechado. Abra o caixa antes de receber."
- "Este pedido já está pago." / "Este pedido já foi recebido no caixa do salão."
- "Saldo cliente" exige pedido ligado a cliente cadastrado; senão, receba no caixa do salão vinculando o cliente.
- No pinpad o valor é o total exato; se mudou: "O total do pedido mudou… Atualize a tela." Se a maquininha cobrou e o caixa falhou, anote o NSU.

## Novo pedido ("Pedido por telefone", /delivery/novo)

**Para que serve:** lançar pedido que chegou por telefone, WhatsApp, Instagram ou balcão. Já nasce aceito e imprime na cozinha.

**Como fazer:**
1. Toque nos produtos ("Buscar produto..."); pizza em "Montar pizza".
2. Digite o telefone (cliente conhecido traz nome e endereço) e o "Nome".
3. "Entrega" ou "Retirada". Na entrega, preencha o endereço e clique em "Calcular taxa pela distância" (ou digite a taxa).
4. Escolha "Forma" e "Origem"; em dinheiro, "Troco para quanto?". Opcional: agendar, desconto com motivo, observação.
5. "Criar pedido".

**Regras e avisos:**
- "Adicione itens ao pedido." / "Informe o nome do cliente." / "O pedido mínimo é R$ … (sem contar a entrega)."
- Taxa: "Preencha a rua primeiro."; o endereço do restaurante precisa estar nas Configurações; "fora da área!" quando não cai em nenhuma área.
- "Nenhuma impressora da cozinha recebe esses itens (confira em Impressoras)."

## Áreas e tele (/delivery/areas)

**Para que serve:** desenhar as áreas de entrega no mapa, cada uma com sua taxa, e criar promoções da tele.

**Como fazer:**
1. Clique no mapa para marcar os cantos (mínimo 3). Arraste um canto para mover; arraste a bolinha do meio para criar canto; botão direito apaga. "↶ Desfazer ponto" e "limpar" ajudam.
2. Nome, cor, "Taxa cliente (R$)", e opcionais "Motoboy (R$)" e "Tempo (min)". "Salvar área". Na lista: "Desligar"/"Ligar" ou lixeira.
3. Promoção: nome, "Entrega grátis" / "Desconto em %" / "Desconto em R$", áreas e dias (nenhum = todos), mínimo, validade e horário. "Criar promoção".

**Regras e avisos:** com uma área ativa, a taxa é pela área; sem nenhuma, vale o cálculo por km das Configurações. Erros: "Dê um nome pra área.", "Desenhe a área no mapa (pelo menos 3 pontos)."

## Configurações do delivery (/delivery/config)

**Para que serve:** endereço do restaurante, taxa por km, horários, aviso no app, abrir/fechar, turnos e testes de Pix e WhatsApp.

**Como fazer:**
1. "Endereço do restaurante" (ao salvar, vira o ponto de partida no mapa; confira o pino), "Taxa base (R$)", "Valor por km (R$)", "Raio máximo (km)", "Tempo de preparo (min)".
2. "Aviso no app do cliente": faixa no topo do app; vazio não mostra.
3. "Horários e agendamento": para Almoço e Noite, dias, "Agendamento abre", "Pedidos livres de" / "até"; também intervalo, pedidos por horário, antecedência e pedido mínimo (sem a taxa, vale na retirada).
4. "Delivery ligado": desmarque para fechar na hora. Clique em "Salvar".
5. "Turnos e numeração": nome, começa e acaba; "+ turno"; "Salvar turnos".
6. "Testar Pix (cobrança de R$ 0,01)", "Conectar WhatsApp", "Testar envio" e "Ver modelos".

**Regras e avisos:**
- Pedido "pra agora" só na janela livre; agendamento abre antes, para horário da janela livre do mesmo dia. Turno sem dia marcado fica desligado.
- Turnos: não podem se sobrepor nem repetir nome; "Extra" é reservado para horário fora dos turnos. Turno que passa da meia-noite conta no dia em que começou. Mudança vale só para pedidos novos.
- Sem a chave do mapa, a distância é aproximada (linha reta).

## Cupons (/delivery/cupons)

**Para que serve:** códigos de desconto que o cliente digita no carrinho do app.

**Como fazer:** preencha "Código", "Tipo" ("% do pedido" ou "R$ fixo"), "Valor", e se quiser "Pedido mínimo (R$)", "Válido até", "Limite de usos" e "Uma vez por cliente". "+ Criar cupom". Na tabela: "uma vez por cliente"/"liberar pra todo pedido", "desativar"/"reativar", "excluir".

**Regras e avisos:** o código fica em maiúsculas, só letras e números. "excluir" apaga de vez; para só parar, "desativar". A tabela marca "VENCIDO" e "ESGOTADO".

## Cashback (/delivery/cashback)

**Para que serve:** devolver ao cliente uma porcentagem do pedido como saldo.

**Como fazer:** "Cashback ligado", porcentagem, "Valor máximo de resgate" (vazio = sem limite), validade em dias, onde ganha ("Cardápio online", "Pedido lançado no painel", "Balcão (PDV)"), formas que não dão cashback, combos e promoções de fora. "Salvar".

**Regras e avisos:** só o dono muda ("Só o dono muda a configuração do cashback."). Mostra saldo em aberto, clientes com saldo e "Últimos movimentos".

## Campanhas (/delivery/campanhas)

**Para que serve:** mensagens pelo WhatsApp oficial para grupos de clientes, em lotes, no horário marcado, com vendas e total vendido por campanha.

**Como fazer:**
1. "+ Campanha", 5 passos ("Próximo →"): nome; público (todos com WhatsApp, nunca comprou, comprou nos últimos X dias, não compra há X dias, comprou X vezes ou mais, tem saldo de cashback; "Quantos clientes?" conta); dias e horário; cupom opcional ("Anexar cupom ao link da campanha"); modelo aprovado com as variáveis ("Enviar teste" manda para o seu WhatsApp; mostra o custo estimado).
2. "Salvar rascunho" ou "Lançar". Dentro da campanha: "Lançar", "Pausar", "Retomar", "Cancelar"; mostra fila, enviadas, lidas, falhas e "Por que falhou".

**Regras e avisos:**
- Fica de fora quem respondeu SAIR ou não quer promoções. Fora do horário, espera o próximo dia marcado; público maior que o limite diário leva vários dias.
- Erros: "Dê um nome pra campanha.", "Escolha o público.", "Marque pelo menos um dia da semana.", "Escolha o modelo da mensagem." Imagem só JPG ou PNG até 5 MB.
- Cancelar: quem está na fila não recebe.

## Gatilhos automáticos (/delivery/gatilhos, botão em Campanhas)

**Para que serve:** mensagens que saem sozinhas: Comprou, Primeira compra, Cupom, Comprou de campanha, Cashback, Expiração de cashback, Inativo, Em risco, Nunca comprou, Aniversariante, Carrinho abandonado.

**Como fazer:** "Configurar mensagem", escolha o modelo e as variáveis, "Salvar" e ligue em "Ligar". Embaixo, "Histórico de disparos".

**Regras e avisos:** sem modelo não liga ("Escolha o modelo antes de ligar."). O mesmo cliente recebe no máximo uma a cada X dias, na faixa de horário de Modelos e limites.

## Modelos e limites do WhatsApp (/delivery/whatsapp, botão em Campanhas)

**Para que serve:** ver os modelos na Meta (Aprovado, Em análise, Recusado, Pausado pela Meta, Desativado), criar modelo e definir limites.

**Como fazer:**
1. Novo modelo: texto sugerido (opcional), nome (letras minúsculas, números e _), Marketing ou Utilidade, texto, exemplo de cada variável, rodapé (até 60 letras). "Enviar pra aprovação".
2. Limites: máximo por dia, intervalo dos gatilhos por cliente, horário dos gatilhos e preço por mensagem (só estimativa). "Salvar limites".

**Regras e avisos:** promoção e convite são marketing; agradecimento e aviso de cashback são utilidade (mais barato); a Meta pode mudar. Número novo começa com 250 pessoas por dia. Modelo com imagem se cria no gerenciador da Meta.

## Entregadores (/delivery/entregadores)

**Para que serve:** cadastrar motoboys, dar acesso ao app de entregas, definir quanto ganham e ver onde estão.

**Como fazer:**
1. Fixo: escolha em "Fixo · puxar de Colaboradores" e "Adicionar fixo" (já entra com a regra dos fixos). Eventual: nome e telefone, "Adicionar eventual". Marque Almoço/Noite.
2. Acesso: "Gerar código" (ou "Trocar código") e "Mandar no WhatsApp"; ou "Mostrar QR code e link" e ele toca em "Ler QR code" no app.
3. Celular perdido ou link vazado: "Trocar o link (celular perdido ou link vazou)".
4. Valores: fixo almoço, fixo noite, por tele (vazio = da área), teles grátis no almoço, valor depois das grátis, troco que leva. "Salvar". "Desativar"/"Ativar".
5. Atalhos: "Caixa dos motoboys" e "Acerto do dia".

**Regras e avisos:** o código vale uma vez e por 7 dias; quem já entrou continua entrando. "online agora" = posição de até 3 minutos. Fora do turno dele, ganha só a área.

## Caixa dos motoboys (/delivery/entregadores/caixa)

**Para que serve:** no fim do turno, conferir o dinheiro e as maquininhas do motoboy e lançar os pedidos dele no caixa.

**Como fazer:** confira a forma de cada pedido (troque se ele marcou errado), o "Troco", o "Dinheiro que ele devolveu (contado)" e a "Soma dos comprovantes". A diferença aparece na hora. "Fechar caixa do (nome)".

**Regras e avisos:**
- "O caixa está fechado. Abra o caixa antes de fechar o do motoboy."
- Não bateu: pede "Fechar mesmo assim" e a diferença fica registrada.
- "Chegou entrega nova desse motoboy. Atualize a tela e confira de novo."
- Pix online já sai pago e não aparece. O caixa do salão só fecha depois que todos os motoboys fecharem.

## Acerto do dia (/delivery/entregadores/acerto)

**Para que serve:** calcular o pagamento de cada entregador no dia (fixo + teles) e registrar; aparece em "Meus ganhos" no app dele.

**Como fazer:** escolha o dia, "Ver", ajuste o "Fixo (R$)" se precisar e "Registrar acerto".

**Regras e avisos:** antes das 15h é almoço, depois noite. No almoço, a regra dos fixos cobre as primeiras teles grátis e paga as seguintes; tele cobrada paga a área. Confira o recebido com o caixa antes.

## Pedido automático do convênio de marmitas (nos ajustes do Delivery)

**Para que serve:** de segunda a sábado, às 08:35, junta as marmitas pedidas no app do convênio e cria um pedido de delivery por filial, agendado, em "Saldo cliente" (vira conta a receber da empresa conveniada).

**Como fazer:** marque "Criar os pedidos sozinho às 08:35", escolha o "Item cobrado por marmita" e o cliente de cada filial, "Salvar". Pedido que entrou depois das 08:35: "Gerar ou atualizar os pedidos de hoje".

**Regras e avisos:** filial sem cliente não gera pedido. O botão só atualiza se o delivery ainda não saiu. O endereço vem do cadastro do cliente (complete rua e número em Clientes). As etiquetas saem pelo app do convênio.

## Relatórios do delivery (/delivery/relatorios)

**Para que serve:** "Hoje", "7 dias" ou "30 dias": pedidos, faturamento, ticket médio, a receber e cancelados; tabelas por origem, bairro, forma de pagamento e entregador.

## Vitrine do app (/delivery/vitrine)

**Para que serve:** mudar o que o cliente vê no app: banner do topo, sugestões "Quer adicionar?" e cupons automáticos. Vale na hora. Mostra números dos últimos 7 dias.

**Como fazer:**
1. Destaques do topo: "+ Novo", título, subtítulo, produto ou pizza, selo, foto; "Salvar destaque" ou "Apagar".
2. Sugestões: "+ item" em cada grupo; ✕ para tirar.
3. Gatilhos de cupom ("Boas-vindas", "Ficou parado sem escolher", "Carrinho abandonado"): ligue, escolha o cupom e os minutos.
4. "Pré-visualizar no celular".

**Regras e avisos:** o preço do banner é o do cardápio. No máximo um cupom por cliente por dia; nunca com produto em promoção ou outro cupom, nem no carrinho. O cupom tem que estar ativo em Cupons.

---

## Cardápio do dia (/cardapio-do-dia)

Menu Site e apps. Precisa da permissão "Cardápio do dia (site)".

**Para que serve:** montar o cardápio do buffet (site e TV), marcar os pratos das marmitas do delivery, escolher as saladas e trocar as marmitas do convênio num dia.

**Como fazer:**
1. Escolha o dia (setas ou data). Dia vazio: "Começar a partir de:" copia do mesmo dia da semana anterior ou do último preenchido.
2. Em Proteínas, Carboidratos e Especial do dia, clique ou busque os pratos (Enter põe o primeiro; dá para digitar prato novo). Ao lado, marque as marmitas (Tradicional, Do Dia; Premium no sábado).
3. Confira "LIVRE (R$)" e "KG (R$)".
4. "Publicar no site" (ou "Salvar e publicar"). Também: "Salvar rascunho"/"Salvar sem publicar", "Publicar o que está salvo", "Tirar do ar", "Apagar".
5. "Catálogo de pratos": cadastre vários (um por linha) ou tire do catálogo.
6. Saladas: marque e clique em "Salvar só para este dia" ou "Gravar como padrão de (dia)"; "+ nova salada" e "Adicionar".
7. Marmitas do convênio: pratos (até 4), proteínas e salada do dia; "Gravar só este dia".

**Regras e avisos:**
- Status: "no ar", "no ar · com alterações não publicadas" ou "rascunho". "Histórico de publicações" mostra quem fez.
- Marmita sem prato não pode ser pedida. Prato sem preço de adicional não entra como adicional (preço no cardápio do salão).
- Site e TV mostram sempre a tabela de preços do buffet.
- Marmitas do convênio só mudam antes de abrirem os pedidos do dia.
- **Prato repetido:** a IA lê cada prato do catálogo e guarda o ingrediente de destaque (berinjela, abobrinha, peixe...) e o jeito de preparo marcante (lasanha, empanado, escondidinho...). Se dois pratos do dia repetem, aparece o aviso "Prato repetido" (no celular, cada prato mostra "repete ..."). Frango, carne, arroz, feijão, batata e massa podem repetir; a sobremesa não conta no preparo. Ao publicar com repetido, o sistema pergunta: "Voltar" (não publica) ou "Publicar mesmo assim" com o motivo. Aí quem tem a caixinha "Receber aviso no celular quando o cardápio for publicado com prato repetido" (em Colaboradores) recebe a notificação, e o aviso fica em "Publicados com prato repetido" na tela do painel ("Visto" tira o destaque).
- **Corrigir o que a IA leu:** no "Catálogo de pratos", clique na linha de ingredientes embaixo do prato e ajuste (separado por vírgula) e o preparo. Prato corrigido à mão a IA não muda mais.
- **Ideias para este dia:** "Sobras de (dia anterior)" sugere o que fazer com a sobra de cada prato (ex.: carreteiro → bolinho de carreteiro) e "Faz tempo que não sai" mostra pratos bem usados que não aparecem há 14 dias ou mais. Um toque põe o prato no cardápio; depois é só salvar e publicar.
- Prato novo é lido pela IA na hora de publicar; os outros são lidos sozinhos de 10 em 10 minutos.

---

## Clientes (NF-e) (/clientes)

Menu Configurações. Abre para quem tem Salão, PDV, Delivery ou Financeiro.

**Para que serve:** cadastro de clientes (NF-e, fiado, delivery, campanhas).

**Como fazer:** busque por nome ou CNPJ/CPF. "+ Novo cliente" ou "Editar": nome (obrigatório), CNPJ/CPF, "Limite de crédito (fiado)" (vazio = sem limite), inscrição estadual, e-mail, telefone, "Promoções pelo WhatsApp", aniversário e endereço. "Salvar".

**Regras e avisos:** "Remover" apaga nome, telefone, endereço e CPF/CNPJ de todo o sistema (pedidos, reservas, vales, mensagens); valores, fiado e notas ficam. Não dá para desfazer. Quem deve fiado não pode ser removido.

## Formas de pagamento (/formas-pagamento)

Só o dono.

**Para que serve:** as formas que aparecem no Caixa, PDV, Delivery, App do cliente e Fiado. O tipo decide troco, pinpad, nota automática e código fiscal.

**Como fazer:** "Nova forma": nome, tipo, nome no app (opcional), "Pede código no pagamento" (opcional), onde aparece; "Criar forma". Na tabela: clique nos canais para ligar/desligar, "sim"/"não" ativa, setas mudam a ordem, editar, apagar.

**Tipos:** Dinheiro (troco); Pix (QR do Pix online); Pix na maquininha, Crédito, Débito e Vale refeição/alimentação (pinpad); Cartão sem dizer qual (sem pinpad, bandeira à mão); Cortesia (sem receber, pede motivo, sem nota); Vale-presente já pago; Outro (só registra).

**Regras e avisos:**
- "Dê um nome à forma." / "Já existe uma forma com esse nome."
- Apagar não muda vendas antigas; para parar de usar, desative.
- Aviso quando "Cartão (sem dizer qual)" está no mesmo canal das formas com pinpad: escolhido por engano, a venda fica sem passar na maquininha.
- Fixas, fora da lista: "Saldo cliente", "Compra da equipe" e "Pix agora".

## Config fiscal (/fiscal)

Só o dono.

**Para que serve:** dados da empresa e do emissor de NF-e/NFC-e.

**Como fazer:** preencha Empresa (razão social, CNPJ, IE, regime, endereço), Emissor (emissor, ambiente "Homologação (teste)" ou "Produção (valendo)", séries, token, token de homologação, CSC e ID) e Padrões (NCM do buffet, CFOP e CSOSN). "Salvar configuração fiscal". "Emitir nota de teste" confere tudo em homologação.

**Regras e avisos:**
- O certificado fica no painel do emissor. Token e CSC salvos não aparecem; para trocar, cole o novo (vazio mantém).
- Homologação e produção têm tokens diferentes: trocou o ambiente, troque o token.
- Em produção toda NFC-e vale de verdade e a nota de teste não roda; o teste é uma venda de R$ 1 no caixa (cancelável em até 30 minutos).

## Perfis fiscais (/fiscal/perfis)

Só o dono.

**Para que serve:** NCM, CEST, CFOP, CSOSN, origem, unidade e PIS/COFINS por grupo de produtos.

**Como fazer:** "1. Perfis fiscais": "+ Novo perfil" e "Salvar" (marque "Perfil homologado pelo contador" só depois da conferência). "2. Perfil por categoria do cardápio": escolha o perfil de cada categoria. "3. Exceções por item": só quando o item foge da categoria.

**Regras e avisos:** o item usa o perfil dele, senão o da categoria, senão o padrão da Config fiscal. "NCM tem 8 dígitos.", "CEST tem 7 dígitos", "CFOP tem 4 dígitos." Excluir perfil faz quem usava voltar ao padrão. Perfil errado gera multa.

## Notas de entrada (/notas)

Menu Estoque e compras. Precisa da permissão "Notas Fiscais".

**Para que serve:** trazer notas de compra (XML, SEFAZ ou QR do cupom de mercado), revisar e lançar como conta a pagar.

**Como fazer:**
1. "+ Importar XML" com os arquivos .xml; ou "Buscar notas" na SEFAZ; ou leia/cole o QR do cupom e "Importar".
2. Notas só em resumo: "Selecionar notas" e "Manifestar N selecionada(s)"; os itens chegam em minutos, ou "Buscar itens agora".
3. Na lista: "Revisar e lançar", "Cancelar" (pendente) ou "Estornar" (lançada).

**Regras e avisos:**
- A SEFAZ libera 1 busca por hora (a tela mostra quando libera); a busca também roda sozinha.
- "Esta nota já foi importada." / "Arquivo não parece uma NF-e válida." "aguardando itens" = manifestada.
- Estornar tira as contas do Contas a pagar e volta a nota para pendente; não deixa se houver parcela paga ("Desfaça o pagamento no Contas a pagar antes."). Cancelar tira as contas do financeiro.

## Revisar e lançar uma nota (/notas/[nota])

**Como fazer:**
1. Tipo "Mercadoria" ou "Serviço" (serviço pede a categoria; "Usar sempre esta categoria" fixa para o fornecedor).
2. Confira fornecedor, vencimento e "Competência (mês)". Boleto com custas/desconto: "Valor do boleto" e "Salvar valor do boleto". Parcelado: "Dividir em" e "Salvar parcelamento".
3. Itens: vincule ao produto, preencha "Por un." quando vem em caixa/fardo (ou o total que veio) e para quem é (casa, sócios ou funcionário). Ajuste a data de entrada se entregaram em outro dia.
4. "Lançar no financeiro". "Cruzar com pedido" → "Vincular". Nota sem itens: "Manifestar e baixar completa".

**Regras e avisos:**
- Sem fornecedor não lança ("Vincule o fornecedor primeiro"); serviço sem categoria também não. Fornecedor fora do cadastro: cadastre com o CNPJ da nota.
- Item para funcionário vai para Compras internas; para os sócios sai do estoque e do CMV. Em nota já lançada, estorne e lance de novo (vale também para mudar parcelas).
- "Marcada como lançada, mas não tem conta a pagar": lance de novo só se o pagamento não foi lançado por fora.

## SEFAZ automático (/notas/sefaz)

Só o dono (botão em Notas de entrada).

**Para que serve:** guardar o certificado A1 e o CNPJ para buscar notas na SEFAZ.

**Como fazer:** arquivo .pfx, senha, CNPJ, vencimento e estado; "Salvar configuração". "Buscar notas agora". Faltam notas: "Últimos 15 dias (rápido)" ou "Desde o início (~90 dias)".

**Regras e avisos:** certificado só no servidor; avisa 30 dias antes de vencer (serve também à nota fiscal e ao Pix). Cerca de 1 busca por hora; continua de onde parou. Sem configurar: "Configure o certificado e o CNPJ primeiro."

## Saúde do sistema (/saude)

Dono, ou quem tem Salão ou Central de Impressões.

**Para que serve:** último sinal das peças de fora do painel (programas dos computadores, balança, pinpads, relógio de ponto, SEFAZ, rotinas, WhatsApp): "Funcionando", "Atenção", "Parado" ou "Sem sinal agora".

**Como fazer:** veja "Precisa de atenção". Em "Fila de impressão": "Imprimir de novo" ou "Tirar da fila".

**Regras e avisos:** comanda da cozinha com mais de 1 hora fica segurada (confira antes de mandar). "Desistiu depois de 5 falhas" = parou de tentar. Tirado da fila só sai se mandar de novo pela tela de origem. "Erros do servidor" só o dono vê.

## Usuários e permissões (/usuarios)

Só o dono.

**Como fazer:** nome, e-mail (login), senha (mínimo 6), permissões ou "Acesso total (dono)"; "Criar usuário". "Editar acesso" → "Salvar acesso" ou nova senha → "Salvar senha". "Excluir" tira o acesso.

**Regras e avisos:** "Preencha nome, e-mail e uma senha de pelo menos 6 caracteres." Ninguém exclui a si mesmo. Só do dono: Usuários, Config fiscal, Perfis fiscais, Formas de pagamento, Aparência e SEFAZ automático.

## Aparência da empresa (/aparencia)

Só o dono.

**Para que serve:** cores da empresa em todas as telas (painel, apps e cardápio do cliente).

**Como fazer:** "Cor principal", "Escuro da marca" e "Texto sobre o escuro"; confira a prévia; "Salvar cores" ou "Desfazer".

**Regras e avisos:** os outros tons são calculados sozinhos; cor clara demais deixa a letra do botão escura sozinha. "Empresa deste acesso" mostra de qual empresa é o acesso.
