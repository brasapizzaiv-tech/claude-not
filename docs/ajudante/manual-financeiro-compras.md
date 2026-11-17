# Manual: Estoque, compras e financeiro

## O caminho de uma compra, do começo ao fim

1. **Contagem** (menu Estoque e compras → Contagem de estoque): a equipe conta o que tem. Ao finalizar, a contagem vira a base da compra e também do CMV.
2. **Cotação** (Cotações): o sistema sugere quanto comprar (estoque ideal − o que foi contado, arredondado pra fechar fardos). Você ajusta as quantidades, convida os fornecedores e manda o link pelo WhatsApp. Cada fornecedor responde os preços pelo link.
3. **Comparar preços e gerar pedidos**: na comparação você escolhe de quem comprar cada item e clica em "Gerar pedidos →". Sai um pedido por fornecedor, que você envia pelo WhatsApp em "Ver pedidos →". Produto com um fornecedor só (exclusivo) nem passa pela comparação: vai direto pro pedido dele.
4. **Chegada da mercadoria**: no dia da entrega, o app da equipe pergunta se chegou ("Chegou", "Ainda não", "Não veio") e a equipe conta o que recebeu. No painel, a tela Conferência mostra o pedido para o escritório revisar e clicar em "Confirmar conferência".
5. **Nota fiscal**: a nota do fornecedor entra em Notas de entrada e é ligada ao pedido. Assim o sistema compara pedido × recebido × nota e aponta as divergências.
6. **Contas a pagar**: ao lançar a nota no financeiro ("Lançar no financeiro", na tela da nota) ela vira conta a pagar. Se o pedido foi conferido sem nota ligada, a própria conferência lança a compra no financeiro. Com nota ligada, a conta a pagar é a da nota (não lança duas vezes).
7. **CMV**: a contagem da semana seguinte fecha a conta: Estoque inicial + Compras − Estoque final = o que foi consumido.

Ao confirmar a conferência, o preço recebido atualiza o "Preço ref." do produto, que é usado nas próximas cotações e no CMV.

---

## Produtos (/produtos)

### Para que serve
Lista de tudo que o restaurante compra e conta no estoque: unidade, estoque ideal, fardo, fornecedores e preço de referência.

### Como fazer
- **Cadastrar**: clique em "+ Adicionar", preencha Nome, Categoria, Unidade, "Estoque ideal" e "Fardo (und por fardo)" e clique em "Salvar".
- **Mudar ideal ou fardo rápido**: digite direto nas colunas "Ideal" e "Fardo" da lista. Salva ao apertar Enter ou Tab (aparece um ✓).
- **Ligar fornecedores**: clique no botão da coluna "Fornecedores" ("sem fornecedor" ou "2 fornecedores", por exemplo), marque os fornecedores e salve. Marque "Fornecedor exclusivo" se o produto só vem de um (aí ele vai direto pro pedido desse fornecedor, sem cotação).
- **Vários de uma vez**: marque as caixinhas dos produtos. Aparece uma barra para "Vincular ao fornecedor", "Contagem: só “precisa comprar?”", "Contagem: quantidade" e, com exatamente 2 marcados, "Mesclar os 2".
- **Mesclar**: para o mesmo produto cadastrado duas vezes. Você escolhe qual fica; todo o histórico do outro passa pra ele.
- "Remover" tira o produto da lista (o histórico fica guardado).

### Campos do cadastro
- **Estoque ideal**: quanto você quer ter sempre. A sugestão da cotação é ideal − contado.
- **Fardo**: unidades por fardo. Se preenchido, a sugestão arredonda para fardos inteiros.
- **Tamanhos da embalagem**: para produto que vem em vários tamanhos (ex.: 1; 1,04; 1,7 kg). Na contagem cada caixa diz o tamanho e o sistema mostra o total real.
- **"Na contagem, só perguntar se precisa comprar"**: para item difícil de contar. A pessoa responde "precisa" ou "tem". Se precisa, a cotação sugere o estoque ideal (ou um fardo). Esses itens não entram no valor do estoque do CMV.
- **Validade após manipulação**: dias usados nas etiquetas. **ICMS-ST** e **Dados fiscais**: informados pelo contador.

### Regras e avisos
- Produto sem nenhum fornecedor não aparece pra ninguém na cotação.
- Ao marcar "Excl." num produto que tem 2 ou mais fornecedores, o sistema abre a janela para escolher qual fica.
- Se os dois produtos mesclados têm unidades diferentes, aparece um aviso: as quantidades antigas passam como se fossem na unidade do que fica. Confira antes.

---

## Categorias de produtos (/categorias)

### Para que serve
As seções dos produtos (Bebidas, Limpeza etc.). Elas organizam a contagem, a cotação e dizem em qual conta do DRE a compra cai. Esta tela não aparece no menu; abre pelo endereço /categorias. Quem tem a permissão de Produtos pode usar.

### Como fazer
- "+ Adicionar" cria uma categoria; "Editar" muda o nome.
- Na coluna "Conta no DRE (compras)" escolha onde a compra desses produtos entra no financeiro. "— não lançar —" deixa sem conta.
- Clicar em "N produtos" abre a lista de Produtos já filtrada.

### Regras e avisos
- "Remover" numa categoria com produtos pergunta antes: os produtos ficam sem categoria.

---

## Fornecedores (/fornecedores)

### Para que serve
Cadastro de quem vende para o restaurante, usado nas cotações, pedidos, notas e cobranças.

### Como fazer
- "+ Adicionar" abre o cadastro (nome, contato, telefone, WhatsApp etc.).
- **"O que este fornecedor vende"**: marque as categorias de produto; ele fica ligado a todos os produtos delas, inclusive os novos.
- **"Sempre convidar pras cotações"**: entra sozinho em toda cotação nova que tenha item dele (na lista: "Sempre convidar" / "Não convidar sempre").
- **Padrão das notas**: "Categoria da despesa (DRE)" e "Tipo de nota", que já vêm preenchidos nas notas dele.
- "Inativar" tira das cotações; na aba "Inativos" há "Reativar".
- Sem WhatsApp cadastrado, não dá para abrir a conversa de cotação ou pedido.

---

## Contagem de estoque (/contagens)

### Para que serve
Contar o estoque. A contagem finalizada é a base da cotação e do CMV.

### Como fazer
- **Contagem no painel**: "+ Nova contagem" e depois "Abrir". Digite cada quantidade em "Em estoque" (aceita conta: 12+8, 3*12). O botão "0" marca item que zerou. "Salvar" guarda; "Finalizar" fecha; "Reabrir" volta a abrir.
- **Dividir entre a equipe**: na contagem, "Dividir por categoria". Escolha o responsável de cada categoria (ou "Atribuir tudo"). Em "Links para enviar" há "Copiar" e "WhatsApp" de cada pessoa.
- **"Contagem avulsa"**: marque as categorias, escolha o colaborador e clique em "Criar e gerar link".

### Regras e avisos
- **"Faltam N itens sem contar"**: ao salvar, dá para "Salvar assim mesmo". Ao finalizar, os itens em branco são gravados como 0 ("Finalizar (em branco = 0)") e entram na cotação. Se algum não era pra contar, volte e tire da lista.
- **"Itens com número maior do que podia ter"**: o número é maior que a última contagem mais o que chegou depois. Pode ser erro de digitação ou mercadoria que chegou sem nota lançada. Conte de novo e clique em "contei de novo, está certo" ou "Já contei de novo, está certo".
- Abaixo de cada item aparece "última: X · chegou: Y" e o consumo médio, para ajudar a conferir.
- "Remover" só aparece em contagem em rascunho. Contagem finalizada não pode ser removida porque já entrou no CMV ("reabra antes"). Contagem ligada a uma cotação ou pedido também não pode ser removida.
- "Essa contagem já foi finalizada. Reabra antes de mudar." aparece se alguém tenta salvar uma contagem já fechada.

## Agendamentos de contagem (/contagens/agendamentos)

### Para que serve
No dia e horário marcados, o sistema cria a contagem sozinho e ela aparece no app de cada colaborador.

### Como fazer
1. Clique em "+ Novo agendamento".
2. Dê um Nome (ex.: "Contagem da salada"), escolha a Frequência (Diária, Semanal, Quinzenal), o Dia da semana e o Horário (de 15 em 15 minutos, até 23:45).
3. Em Divisão escolha: "Repetir última divisão" (usa quem contou o quê na contagem anterior), "Dividir entre todos (rodízio)" ou "Personalizado (escolher)".
4. Clique em "Salvar". Na lista há "Editar", "Pausar"/"Ativar" e "Excluir".

Dica: faça uma contagem dividida manualmente uma vez; depois o "Repetir última" repete sozinho.

## Consumo do estoque (/contagens/consumo)

Mostra quanto sai de cada produto por semana: **tinha + chegou − tem agora**, entre duas contagens seguidas. A compra conta no dia em que chegou (o "Chegou" da equipe ou a conferência). A média é das últimas 8 semanas e o gráfico mostra as últimas 12. Contagem que deu consumo negativo (estoque subiu sem nota nem pedido) e entrada fora de proporção (nota em peças, contagem em caixa) ficam fora da conta.

---

## Cotações (/cotacoes)

### Para que serve
Escolher o que comprar e pedir preço aos fornecedores.

### Como fazer
1. **Criar**: escolha a contagem base ("Base: …") ou "Sem contagem (usar só o ideal)" e clique em "+ Nova cotação". Depois clique em "Abrir".
2. **Quantidades**: a tabela mostra Contado, Ideal, Sugestão e "A cotar". Na primeira vez a sugestão já vem preenchida. "Preencher com a sugestão" preenche de novo. A tela salva sozinha ao parar de digitar ("Salvo sozinho"), e também tem "Salvar" e "Desfazer salvamento".
3. **"Gerar pedidos exclusivos"**: gera já o pedido dos produtos que só têm um fornecedor, para enviar sem esperar a comparação.
4. **"Fornecedores →"**: use "Convidar" ou "Convidar todos". Depois "Abrir WhatsApp do próximo" abre o WhatsApp Web com a mensagem e o link; é só apertar Enviar e voltar para o próximo. Cada linha tem "Envio manual", "Copiar link" e "Retirar". Com a extensão de envio do WhatsApp no Chrome, dá para mandar para todos os pendentes de uma vez. "Copiar link único" serve para um vendedor que atende várias empresas. "Editar a mensagem enviada" muda o texto (aceita {link}, {itens}, {nome}, {empresa}, {prazo}).
5. **Prazo**: em "Respostas até" use "Pôr prazo" / "Mudar prazo". Quando vence, o link trava e a cotação fecha sozinha; "Reabrir por mais tempo" reabre.
6. "Fechar" encerra a cotação; "Reabrir" volta a abrir.

### Comparar preços
- Clique num preço para escolher de quem comprar. Contorno verde = mais barato, laranja = escolhido, "+%" = quanto está acima do mais barato. A coluna "Escolhido" mostra se subiu ou baixou desde a última compra.
- "dividir" pede o mesmo item de mais de um fornecedor. Filtros: "Todos", "Sem escolha", "Mais caro que a última".
- O total do fornecedor fica marcado quando está abaixo do pedido mínimo dele. As escolhas ficam salvas e abrem em qualquer computador.
- **"Gerar pedidos →"** cria um pedido por fornecedor, incluindo os exclusivos ("Pedido direto — fornecedor exclusivo", sem preço; o preço se confirma na entrega/nota).
- **Adiantar um fornecedor**: no topo da coluna dele dá para gerar só o pedido dele agora, sem esperar os outros. Se a escolha mudou depois, aparece "Atualizar pedido".
- **"Nova cotação com os itens que faltam"**: cria outra cotação só com o que ainda não foi pedido.

### Ver pedidos
Um pedido por fornecedor com itens, quantidades e total. Use "Copiar" ou "Enviar no WhatsApp".

### Regras e avisos
- Cotação com base em contagem só cota os produtos daquela contagem (mais os que você adicionou).
- Depois de "Gerar pedidos" a cotação fica **travada**: não dá para gerar de novo por cima, para não perder pedidos e conferências. Para pedir o que faltou, use "Nova cotação com os itens que faltam".
- "Os pedidos desta cotação já foram gerados. Para refazer, apague os pedidos e reabra a cotação." Os pedidos se apagam na tela Conferência (ícone da lixeira).
- Pedido que já chegou ou foi conferido não muda mais pela comparação ("já chegou ou foi conferido").
- "A cotação já foi fechada — não dá mais para adiantar."
- "Remover" uma cotação apaga também as respostas dos fornecedores.

---

## Conferência (/conferencia)

### Para que serve
Conferir a mercadoria que chegou contra o pedido, ligar a nota e registrar o que veio diferente.

### Como fazer
- Na lista, a coluna Conferência mostra "✓ nome" (a equipe conferiu no app), "✓ painel" ou "aguardando", e se tem "nota ligada" ou está "sem nota".
- **Conferir**: clique no fornecedor. Cada item mostra Pedido, Equipe (o que contaram no app), Recebido, preços e o que está Na nota. Ajuste Recebido e preço; o que difere do pedido fica amarelo.
- "Adicionar item que veio a mais (não estava no pedido)": escolha o produto, a "Qtd recebida" e adicione.
- "Salvar" guarda; **"Confirmar conferência"** fecha (depois vira "Atualizar conferência").
- **Nota**: se a nota do fornecedor já entrou, aparecem botões "Ligar nota …". Com nota ligada há "Abrir nota" e "Desligar".
- **Entrega**: se a equipe avisou que não veio ou passou do dia, aparece "Remarcar entrega" (escolha em "Vai chegar em") ou "Encerrar aviso (não vem / resolvido)".
- **"Cobrar o fornecedor"**: abre a lista do que faltou ou veio diferente para mandar no WhatsApp do vendedor.
- **"+ Pedido manual"**: para compra feita direto, sem cotação. Escolha o fornecedor, a data, adicione os produtos com quantidade e preço e clique em "Criar pedido e conferir →". Dá também para mandar o pedido no WhatsApp.
- **Excluir pedido**: ícone da lixeira na lista. Remove o pedido e o lançamento dele no financeiro, e não dá para desfazer.

### Regras e avisos
- "Este pedido está ligado à nota … Tire a nota do pedido antes de excluir."
- Sem contagem da equipe, as divergências de quantidade só aparecem quando alguém confirmar o recebimento no app ou no painel.
- Ao confirmar, o preço recebido vira o novo preço de referência do produto.

## Divergências (/conferencia/divergencias)

Relatório do que veio diferente do pedido (não veio, quantidade diferente, preço acima do cotado, cobrado sem receber, item fora do pedido), por período ("De", "Até", "Filtrar") e por fornecedor. Clicando no nome de um fornecedor aparece a cobrança dele no WhatsApp. Preço da nota 1,5 vez ou mais o cotado vira aviso de "unidade diferente" (nota em caixa/fardo): ajuste o fator na nota.

---

## Pedidos da equipe (/solicitacoes)

### Para que serve
Compras para repor e manutenções que o pessoal pediu pelo app.

### Como fazer
- Abas "Pendentes", "Compradas / feitas", "Rejeitadas", "Todas", com filtros por tipo, pessoa e "só urgentes". Urgentes ficam no topo.
- Em cada pedido: "✓ Comprado" (ou "✓ Feito"), "✕ Rejeitar" (ou "Não vai fazer"), "recado" (aparece no app da pessoa), "reabrir" e "apagar". Marcando vários, dá para fazer de uma vez.
- "+ Anotar pedido" registra um pedido feito de boca.

---

## Compras internas (/retiradas)

### Para que serve
O "fiado" dos funcionários: o que cada um pega ou compra do restaurante, e os acertos.

### Como fazer
- **"+ Nova compra"**: escolha a pessoa, o produto do catálogo (opcional) ou escreva o item, valor, peso (opcional) e observação. Clique em "Lançar".
- **"Por funcionário"**: mostra Comprado, Pago e Em aberto de cada um.
  - "Quitar": paga tudo que está em aberto da pessoa.
  - "Receber parte": a pessoa paga só uma parte; quita as compras mais antigas e divide a que não couber. O que sobrar continua em aberto.
- Clicar na situação de uma compra alterna "Pago" / "Em aberto". "Acertos (quitações)" mostra quando cada um acertou e quanto. "Produtos e preços" é o catálogo.

---

## Movimentações (/financeiro)

### Para que serve
Todos os lançamentos de receitas e despesas do mês, com Receitas, Despesas e Resultado no topo. Pedidos conferidos e notas entram sozinhos.

### Como fazer
Para lançar uma despesa ou receita manual:
1. **Competência**: o mês da despesa, que é o que vale no DRE. Pagou em agosto uma conta de julho? Ponha julho aqui e a data do boleto no Vencimento.
2. **Categoria**, **Valor (R$)**, **Descrição** (opcional), **Emissão**, **Vencimento**, **Pago em** / "Já pago", **Origem (banco)** e **Tipo pagto.**
3. **Repetir**: "Não", "Parcelado" ou "Mensal fixo", com "Vezes" e "Frequência".
4. Clique em "Lançar".

As setas trocam o mês; os botões do topo levam às outras telas do financeiro.

### Regras e avisos
- Só lançamento manual tem "Editar" e remover. Os automáticos aparecem com a etiqueta "caixa" ou "auto" e se corrigem na origem (nota, conferência, caixa).

## Categorias do DRE (/financeiro/categorias)

Acesso pelo botão "Categorias" em Movimentações. Cada conta lançada entra numa destas categorias, e é assim que o DRE se monta.

- Para criar: preencha "Nova categoria", "Onde entra no DRE" (Receita, Deduções, CMV, CMO variável, Tarifas, Despesa fixa, Financeiras, Impostos, Não operacional) e "Grupo", e clique em "Criar".
- Na lista: "renomear", "desativar"/"reativar" e "apagar".
- **Categoria com conta lançada não pode ser apagada**: desative. Ela some das listas novas e o histórico continua certo. Mensagem: "Esta categoria está em uso… Desative em vez de apagar".
- Categorias marcadas "usada pelo sistema" (Dinheiro, PIX/Transferência, Cartão, Vendas do Fiado, Saldo, Compras (Pedidos), CMO Eventual / Diaristas) são procuradas pelo nome pelo fechamento de caixa, pela conferência e pelos diaristas. Renomear quebra essa ligação, e o sistema avisa antes.

---

## Fechamento de caixa (/financeiro/caixa)

Fechamentos **digitados do sistema antigo**. Os caixas do sistema novo ficam em Salão → Caixa → Fechamentos. "+ Novo fechamento" pede os totais do dia e o valor por forma de pagamento; ao salvar, o faturamento entra como receita no financeiro, cada forma na sua categoria.

---

## CMV / Consumo (/financeiro/cmv)

### Para que serve
Mostra o CMV real da semana: quanto de mercadoria foi consumido, em reais e em % do faturamento.

### Como funciona
- **Conta**: Consumo da semana = **Estoque inicial + Compras − Estoque final**. O estoque é valorizado pelo preço de referência de cada produto.
- **Semana = segunda a domingo.** A contagem de segunda de manhã é o estoque inicial; a contagem da segunda seguinte (ou a do sábado, no caso das bebidas) é o estoque final. Contagens feitas com até 2 dias de diferença contam como uma só "virada" (ex.: estoque, bebidas e limpeza da mesma semana).
- **Compras**: pela data de emissão da nota quando existe nota; senão, pelo pedido conferido. Itens da nota destinados a sócios ou funcionário não contam.
- **Faturamento**: vem sozinho da planilha importada ou do caixa do sistema (o valor em cinza dentro do campo). Hoje o caixa do sistema só tem o almoço, então **a noite precisa ser digitada**. Digitar corrige um turno; apagar volta ao automático.
- **CMV %** = CMV ÷ faturamento, comparado com a "Meta CMV (%)" (padrão 29%).

### Como fazer
- Navegue com "← semana anterior", "próxima →" e "Semana atual", ou escolha uma data em "Semana de" e clique em "Ver".
- Dá para corrigir direto na tabela as quantidades de estoque inicial e final e o valor de "Compras" (campo laranja = corrigido à mão; apagar volta ao automático).
- A caixinha "CMV?" tira um produto ou categoria do cálculo (vai para "Inativos" e pode voltar).
- "Decisão" mostra "COMPRAR" quando o estoque final está abaixo do ideal. "Maiores aumentos de preço na semana" compara com a semana anterior.

### Regras e avisos
- Precisa de pelo menos duas contagens finalizadas.
- **Semana em andamento**: sem a contagem final, o CMV ainda não fecha; a tela mostra "Compras até agora", "Faturamento até agora" e "Compras / Faturamento" (uma prévia, não o CMV). A correção manual de Compras só vale depois que a semana fecha.
- Itens de "precisa comprar?" (sem quantidade) não entram no valor do estoque.

---

## Contas a pagar (/financeiro/contas)

### Para que serve
Ver e dar baixa nos boletos e contas, e baixar o relatório para a contabilidade. Quem tem só a permissão "Contas a pagar" vê apenas esta tela do financeiro.

### Como fazer
- Situação: "Em aberto", "Pagas", "Todas". Nas abertas, as "Vencidas" vêm em bloco e o resto por dia.
- Filtros (competência, vencimento, lançamento, pagamento, banco, tipo, categoria) + "Aplicar"; "Limpar" tira tudo. A busca acha também pelo valor.
- **Pagar uma conta**: ajuste a data do pagamento (padrão hoje) e clique em "Pagar". Conta paga tem "Reabrir".
- **Pagar várias**: marque as caixinhas, escolha a data e clique em "✓ Dar baixa em N". O sistema confirma a quantidade e o total.
- **Boleto com valor diferente da nota** (juros, custas, desconto): clique no valor e digite o valor cobrado. Em conta de nota, a diferença vira um lançamento à parte em despesas bancárias e o valor da mercadoria (CMV) não muda.
- Clique nos títulos "Conta" ou "Valor" para ordenar.
- "Baixar relatório (Excel)" gera a planilha com os filtros aplicados.

---

## Orçamento (/financeiro/orcamento)

Defina a meta de cada categoria no mês e compare com o realizado (colunas Orçado, Realizado e Diferença). Troque o mês nas setas e clique em "Salvar orçamento".

---

## Conciliação bancária (/financeiro/banco)

### Para que serve
Casar cada movimento do extrato com um lançamento do financeiro.

### Como fazer
1. Clique em "+ Importar extrato (OFX)", escolha o banco e o arquivo (repetidas são ignoradas).
2. Escolha o mês; abas "A conciliar" e "Conciliadas".
3. Com sugestão, clique em "Conciliar" (ou "Conciliar selecionadas" / "Conciliar todas"). Sugestão longe da data mostra "confira a data" e "Conciliar assim mesmo". "Lançar nota e conciliar" lança uma nota pendente já paga.
4. Sem sugestão, "Lançar ▾": "Criar lançamento novo" (categoria + "Gerar … e conciliar"), "＋ dividir em várias categorias" (a soma tem que bater) ou "Vincular a um lançamento existente".
5. "Desfazer" tira a conciliação; se o lançamento nasceu do extrato, a tela pergunta se apaga junto.

### Regras e avisos
- "Essa transação já está conciliada. Atualize a tela." aparece quando outra aba já conciliou.

---

## Fatura do cartão (/financeiro/fatura)

### Para que serve
Lançar cada compra da fatura do cartão na sua categoria, em vez de uma linha só de "cartão de crédito".

### Como fazer
1. Baixe a fatura no aplicativo do banco (PDF ou CSV; foto escaneada não serve) e clique em "Ler fatura".
2. Escolha a categoria de cada compra (amarelo = sem categoria). "iguais" repete a categoria no mesmo estabelecimento; "✕" tira da lista.
3. Confira Competência, Vencimento, Banco e, se quiser, "Conciliar com o débito da fatura", e lance.

Da próxima vez os estabelecimentos já vêm classificados. Se lançar duas vezes: "Essa fatura já foi lançada… Confira em Contas a pagar."

---

## Vendas (/financeiro/vendas)

Compara, dia a dia, as notas de venda (NFC-e) emitidas com o faturamento. Escolha "De" e "Até" e clique em "Filtrar". "Importar faturamento (planilha)" carrega a planilha de custo (.xlsx), que passa a valer no lugar do caixa naqueles dias.

## Produtos vendidos (/financeiro/vendidos)

Tudo que saiu no salão, balcão, balança e delivery, pelas comandas. Escolha o período ("Hoje", "Ontem", "Este mês" ou "De"/"Até"), o Turno (a noite começa às 17h) e "Agrupar por" (Produto, Categoria, Turno, Forma de pagamento, Garçom, Origem). "só pagos" filtra o que já foi pago. Mostra também o buffet e os cancelados. "Exportar (planilha)" baixa a lista.

## Buffet: livre × quilo (/financeiro/buffet)

Almoço, pelas pesagens da balança: quanto o livre rende, quanto as mesmas pessoas pagariam no quilo e o efeito de subir o livre, semana a semana. "Pode perder" é quanto a receita do livre pode cair antes do "só quilo" render menos que hoje. A conta supõe que ninguém muda de hábito.

## DRE (/financeiro/dre)

O resultado do mês, da Receita Bruta até o resultado, cada linha com o % da receita. Troque o mês nas setas; "Mostrar todas" inclui as categorias sem valor. A receita vem da planilha nos dias importados e do caixa do sistema nos outros (hoje só o almoço). As despesas entram pelo mês da competência.

---

## Cofre (/cofre)

### Para que serve
Controlar o dinheiro em espécie guardado, nota por nota e moeda por moeda. Precisa da permissão "Cofre".

### Como fazer
- **Primeiro passo**: "Começar a contagem". Conte tudo o que tem no cofre; isso vira o saldo inicial.
- **"Esperando entrar ou sair do cofre"**: troco para abrir o caixa, dinheiro dos caixas fechados e sangrias. Use "Guardar no cofre", "Contar e guardar", "Contar e tirar" ou "Corrigir".
- **Botões**: "Pagar uma conta", "Troco pro motoboy", "Depósito no banco", "Chegou troco", "Trocar notas", "Mínimo e máximo" e "Conferir cofre".
- **Pagar uma conta**: busque a conta em aberto ("Pagar e dar baixa" dá baixa no Contas a Pagar). Se não está lá, preencha descrição e categoria e use "Pagar e lançar no financeiro".
- **Trocar notas**: o que sai e o que entra têm que dar o mesmo valor.
- **Mínimo e máximo** (em quantidade de notas/moedas): abaixo do mínimo aparece "encomendar troco" → "Marcar como encomendado"; acima do máximo, para depositar. 0 e 0 = não controlar.
- O histórico das movimentações tem "Desfazer".

### Regras e avisos
- "Não tem essa quantidade no cofre." Confira as notas e moedas que saem, ou faça a conferência do cofre antes.
- Se a contagem não bate com o esperado, o sistema pergunta se registra assim mesmo. Na conferência do cofre, diferença exige escrever o motivo.
- "O mínimo não pode ser maior que o máximo."
- "Essa conta já está paga."
- Ao desfazer um pagamento, a conta volta para o Contas a Pagar (ou é apagada, se foi criada pelo cofre). Adiantamento já descontado no acerto da semana não pode ser desfeito pelo cofre.

---

## Quem pode acessar

Cada tela depende da permissão dada em Usuários e permissões: Produtos e Categorias, Contagem de estoque, Cotações, Conferência, Fornecedores, Pedidos da equipe, Compras internas, Financeiro (completo), Contas a pagar (só baixa de boletos) e Cofre. Quem não tem a permissão não vê o item no menu.
