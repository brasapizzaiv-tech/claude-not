# Manual: Salão, Caixa, PDV, Cozinha, Reservas, Etiquetas e Impressão

Quem vê cada tela depende das permissões do usuário (tela "Usuários e permissões"):
- **Salão / PDV**: Mesas e comandas, Caixa (e todas as telas dele), Cardápio e config, Notas fiscais (NFC-e), Cancelados e Balança do buffet.
- **PDV (balcão)**: PDV balcão.
- **Quadro do rodízio (cozinha)**: Quadro do rodízio, Rodízio · relatório e Recados da TV.
- **Etiquetas**: Etiquetas de validade.
- **Reservas**: Reservas. **Recepção (reservas no celular)**: só a tela de reservas de hoje no celular (quem só tem essa permissão já entra direto nela).
- **Central de Impressões**: Central de impressões e Downloads.

---

## Mesas e comandas (/salao)

**Para que serve:** mapa do salão com todas as mesas, o Balcão e a Balança, mostrando quais estão ocupadas, quanto cada uma está devendo e quem pediu a conta. No topo aparece quantas mesas estão ocupadas e quantas pediram a conta.

**Como fazer**
- *Abrir uma comanda numa mesa:* no cartão da mesa (ou do Balcão), clique em "+ Comanda". A comanda nova abre na hora para lançar os itens.
- *Ir direto receber uma comanda:* no campo escuro do topo ("Pagamento rápido"), digite o número da comanda ou passe o leitor no QR do cupom e tecle Enter (ou clique em "Ir ao caixa"). Abre o Caixa com a comanda já escolhida.
- *Filtrar:* use os botões "Todas", "Ocupadas" e "Livres", ou o campo "Buscar por mesa…".
- *Ver tudo de uma mesa:* clique no nome da mesa ocupada. Abre "Detalhes da mesa", com as abas "produtos" e "comandas", o que está pago e pendente, e os totais (Subtotal, Total pago, Total pendente).
- *Cancelar produtos de uma mesa:* em Detalhes da mesa, marque os itens (ou "Marcar/Desmarcar todos"), clique em "✕ Cancelar produtos" e escreva o motivo.
- *Pesar no buffet:* no cartão "Balança", clique em "Pesar" (leva para Balança do buffet).

**Regras e avisos**
- Mesa com contorno laranja = pediu a conta. Quadradinho laranja cheio = ocupada.
- "Comanda “X” não encontrada (aberta).": o número não é de comanda aberta (já paga ou excluída).
- Comandas de delivery não aparecem aqui; ficam na tela Delivery.
- Itens já pagos não podem ser cancelados. O motivo precisa de pelo menos 3 letras.

### Tela da comanda (aberta ao clicar no número da comanda)

**Para que serve:** lançar e tirar itens de uma comanda. O pagamento não é feito aqui, é no Caixa.

**Como fazer**
1. *Lançar item:* abas de categoria ou "Buscar produto pelo nome..." e toque no produto; entra na hora. Produto com opções abre um montador ("Adicionar"). Pizza: tamanho, sabores (pode repetir sabor, ex.: 2/3 e 1/3), borda opcional → "Adicionar pizza". Produto por kg pede o peso (0,452 ou 452).
2. *Tirar um item:* "×" da linha → "Tirar o item" (fica em Cancelados). No Buffet, o "×" pede o motivo.
3. "Reimprimir na cozinha" ao lado de cada pedido manda de novo para a cozinha.
4. "Marcar que pediu a conta" destaca a mesa no mapa (clique de novo para desmarcar).
5. "Virar buffet livre": o cliente pesou e resolveu comer à vontade.
6. "Receber no caixa" abre o Caixa com essa comanda.
7. "Excluir comanda": motivo obrigatório (fica em Cancelados).

**Regras e avisos**
- "Essa comanda já foi fechada no caixa.": a comanda já foi paga.
- Comanda com parte já paga não pode ser excluída (se virou buffet livre, use o botão de buffet livre; recebimento errado, fale com a gerência). Buffet já pago também não; o caminho é o estorno pelo caixa.
- Tudo pago mas a comanda aberta: aparece "Tudo já foi pago no caixa. Falta só fechar a comanda." e o botão "Fechar comanda".
- "Sem conexão. Confira se o item entrou antes de tentar de novo.": olhe a lista antes de lançar de novo, para não duplicar.

---

## Caixa (/salao/caixa)

**Para que serve:** a "Frente de caixa": abrir e fechar o caixa, receber comandas, lançar entradas e saídas de dinheiro e acompanhar as notas fiscais automáticas.

### Abrir o caixa
1. Com o caixa fechado, a tela mostra "Nenhum caixa aberto. Abra um para começar a receber."
2. Preencha "Nome / turno".
3. Em "Troco inicial / saldo anterior", escolha "Nota por nota" (digita a quantidade de cada nota e moeda; a saída já vai contada para o Cofre) ou "Só o total" (o Cofre pede a contagem das notas depois).
4. Clique em "Abrir caixa".
- Mesmo com o caixa fechado dá para consultar: Movimentações, Fechamentos, Cartões (TEF), Pix recebidos, Fiado de clientes e Vales-presente.

### Receber uma comanda
1. No campo "Digite o nº, a mesa, ou passe o leitor no QR do cupom…" escolha a comanda (dá para somar várias na mesma conta).
2. Para fiado, "Vincular Cliente" e busque por nome ou CPF/CNPJ.
3. Na coluna "Consumo", toque no "+" de cada item ou em "Pagar tudo"; vai para o "Resumo de Pagamento".
   - "Pagar parte": divide o que falta por 2 a 12 pessoas ou por um valor digitado; cada parte escolhe "Considerar a taxa de serviço"; depois "Pagar esta parte". A comanda fica aberta com o resto.
   - Ícone de dividir: parte um item em 2 a 10 partes. Lixeira: exclui o item da comanda (pede motivo). "✕": tira desta conta, mas continua na comanda.
   - "Inserir produto" acrescenta um produto avulso. "Cobrar serviço (10%)" liga ou desliga o serviço neste pagamento.
4. Enter (ou o botão) abre a tela "Pagamento": "Desconto" (R$ ou %), "Acréscimo (R$)" e "5% no dinheiro (só no consumo)", que vem ligado e pode ser desligado.
5. Em "Adicionar pagamento" escolha a forma (cada uma tem letra de atalho). O que falta vem preenchido. Lance várias formas até "Falta pagar" zerar.
   - **Dinheiro:** clique nas cédulas (Shift soma); o troco é calculado.
   - **Cartão:** "Passar no cartão" (crédito parcela; débito Banrisul pode ser pré-datado ou parcelado). Maquininha avulsa: "Lançar sem passar no pinpad" e escolha a bandeira.
   - **Pix:** "Gerar QR Code Pix" e mostre o QR; entra sozinho. Banco sem resposta e cliente com comprovante: "Vi que caiu, confirmar". Pela maquininha: "Mostrar QR na maquininha".
   - **Saldo cliente:** precisa do cliente vinculado; respeita o limite de crédito.
   - **Compra da equipe:** escolha o funcionário; vai para Compras internas.
   - **Vale-presente:** digite o código e "Conferir". Vale antigo de papel: "Vale antigo, sem código" e escreva o número no motivo.
   - **Cortesia:** fecha sem entrar dinheiro; motivo obrigatório.
6. Clique em "Finalizar" (mostra o valor).
7. A tela pergunta "O cliente quer nota fiscal?": "Sim, com CPF/CNPJ", "Sim, sem CPF" ou "Não precisa". Também tem "Imprimir recibo (sem valor fiscal)".

### Outras tarefas do caixa
- *Juntar comandas da mesma pessoa:* "Juntar em uma só" junta tudo na de menor número e pergunta como cobrar o buffet (livre de hoje, somar os pesos ou o valor de uma delas).
- *Virar livre:* no chip da comanda pesada, "Virar livre" troca o peso pelo buffet livre do dia.
- *Entrada ou saída de dinheiro:* "Movimentar caixa" → "+ Entrada" (suprimento/troco) ou "− Saída" (sangria/pagamento). Na saída escolha "Vai para o cofre" ou "É um pagamento" (pede a categoria, que vai pro financeiro como despesa paga). Preencha valor e "Motivo" (para quem foi) e clique em "Lançar entrada" / "Lançar saída". O acerto semanal dos funcionários é na tela Semana e 10%, não aqui.
- *Resumo do caixa:* toque para ver saldo anterior, vendas por forma, suprimentos, sangrias, total recebido, dinheiro no caixa e contas fechadas sem dinheiro.
- *NFC-e automática:* o botão "NFC-e automática (Pix/cartão): ligada/desligada". Só funciona com o fiscal em produção. Dinheiro continua manual.
- *Fila da nota automática:* contas em Pix, cartão ou vale aparecem no topo com "sai em…". Nesse tempo dá para digitar CPF/CNPJ e "Emitir e imprimir", ou "Sem nota". Passado o prazo a nota sai sozinha, sem imprimir, e a linha some (reimprimir: Notas fiscais).

### Fechar o caixa (Fechamento Z)
1. Clique em "Fechar caixa (Z)".
2. Confira o resumo (saldo inicial, suprimentos, sangrias, total de vendas e "Dinheiro esperado na gaveta").
3. Conte a gaveta: "Nota por nota" (a contagem vai pronta para o Cofre) ou "Só o total" em "Dinheiro contado (R$)".
4. A tela mostra "✓ Caixa bateu certinho", "Sobra de…" ou "Falta…". Se quiser, escreva uma "Observação (opcional)".
5. Clique em "Fechar e imprimir Z" e confirme. O cupom sai na impressora marcada para NFC-e.

**Regras e avisos do caixa**
- "O caixa está fechado. Abra o caixa antes de receber."
- O Z não fecha com comanda aberta com valor a receber nem com delivery em aberto. A tela lista quais são; receba (ou exclua a comanda aberta por engano) e toque em "Conferir de novo". Delivery com motoboy: Delivery → Entregadores → Caixa dos motoboys.
- Desconto de 100% não fecha a conta: use a forma Cortesia.
- "Passa do limite": o cliente passou do limite de crédito do fiado.
- "O vale só tem R$ X": lance esse valor no vale e o resto em outra forma.
- "Essa conta já tinha sido recebida (outro caixa?)": nada foi lançado de novo; atualize a tela.
- Item já recebido (inteiro ou em parte) não pode ser dividido nem excluído.
- Com o pinpad esperando o cliente, não dá para sair da conta: espere ou cancele na maquininha.
- "Recebido na maquininha sem conta": o cliente pagou no pinpad mas a venda não foi lançada. Se for desta conta, "Usar nesta conta"; se já resolveu à mão, "Já resolvido"; se não é de nenhuma, cancele em Cartões (TEF) para devolver.
- Se a conexão cair ao gravar, o cartão é desfeito ("passe de novo quando a conexão voltar"). Cartão já confirmado no pinpad fica em Cartões (TEF) para cancelar lá.
- "Este caixa já foi fechado. Recarregue a tela do caixa...": a aba estava aberta de antes do fechamento.
- "Nenhuma impressora marcada pra NFC-e na Central de Impressões": marque uma na Central de impressões.

### Movimentações (/salao/caixa/movimentos)
Lista tudo o que entrou e saiu do caixa aberto (ou do último caixa, se nenhum estiver aberto), com totais de vendas, suprimentos e sangrias, e a lista "Caixas anteriores". Em cada venda, "ver pagamento" abre o "Recebimento": como foi pago (com dados do cartão quando passou no pinpad) e o que tinha em cada comanda, com o link "abrir a comanda →".

### Fechamentos (/salao/caixa/fechamentos)
Caixas fechados por período, cada dia em duas linhas (almoço e noite, pelo horário em que o caixa abriu): vendas, dinheiro, cartões, Pix, outros, comandas e ticket, sangrias e "Esperado × contado". Escolha as datas e clique em "Ver". Tem os cartões "Almoço no período", "Noite no período" e "Quebra de caixa (dinheiro)". Em cada linha: "detalhe" (movimentações daquele caixa) e "reimprimir Z".

### Cartões (TEF) (/salao/caixa/tef)
Tudo o que passou no pinpad por período, inclusive recusas (com a mensagem para a assistência). Busca por NSU, autorização, final do cartão, bandeira ou valor; resumo por bandeira e por rede.
- "Reimprimir": via do cliente na impressora.
- "Cancelar": o pinpad pede o cartão de novo. Se a janela do gerenciador pedir a data, é a da venda; se pedir o "Número do Documento", é o NSU. **Se pedir SENHA DE SUPERVISOR, não feche a janela nem aperte Esc** (fechar sem a senha desativa o terminal). Precisa do programa do pinpad rodando no PC e, se a venda entrou no caixa, de um caixa aberto.
- "Entrou no extrato" / "Não entrou": para pagamentos "a conferir", depois de olhar o extrato.
- "Menu administrativo (Elgin)": a opção "Manutenção" desativa o terminal.
- "Pix pelo pinpad (teste)": cobrança de teste, não entra no caixa.

### Pix recebidos (/salao/caixa/pix)
Cobranças Pix (caixa, PDV e app de pedidos) com situação: pago, aguardando ou cancelado. "Estornar" → valor, motivo (mín. 3 letras) → "Devolver" devolve o dinheiro direto para a conta de quem pagou (todo ou parte, até 90 dias). Não dá para desfazer. O estorno não reabre a comanda nem mexe no caixa.

### Fiado de clientes (/salao/caixa/fiado)
Quem deve e quanto. Em cada cliente:
- "Receber": digite o valor, escolha a forma e "Confirmar". Precisa do caixa aberto. Entra no caixa como acerto de fiado (não é venda nova).
- "Dar baixa sem entrar no caixa": para troca de serviço ou cortesia; escolha o motivo ("Troca de serviço", "Cortesia (família e amigos)" ou "Outro") e clique em "Dar baixa". Não entra nada no caixa nem no faturamento.
- "histórico": vendas fiadas e pagamentos.

### Vales-presente (/salao/caixa/vales)
- *Vender:* "Vender vale-presente" → valor, para quem, de quem, mensagem, validade e "Como o cliente pagou" → "Recebi R$ X — gerar o vale". Entra no caixa de hoje como venda (precisa do caixa aberto); quando usado, não conta de novo.
- *Entregar:* "Cartão, imagem e cupom": imagem, "Abrir WhatsApp", "Imprimir na térmica do caixa", cartão A6 ou folha A4.
- *Usar:* no caixa ou PDV, forma Vale-presente + código. O saldo pode ser usado aos poucos.
- "Prorrogar validade", "Cancelar vale" (pede motivo) e "devolver" (desfaz uma baixa feita por engano). Vale vencido é recusado no caixa: prorrogue aqui.

### Cortesias e vales-presente (/salao/caixa/cortesias)
Contas fechadas sem entrar dinheiro (cortesias e vales usados), com o motivo que o caixa escreveu. Não contam no caixa nem no faturamento. Acesso pelo "Resumo do caixa" ou pelas Movimentações.

### Sangrias (/salao/caixa/sangrias)
Lista as sangrias e se viraram despesa no financeiro. Para classificar as antigas: marque as linhas, escolha a categoria e clique em "Lançar marcadas". O sistema avisa quando já parece existir conta lançada com o mesmo valor perto da data. "desfazer" tira a sangria do financeiro (apaga a despesa criada por ela). "Sem categoria" = fora do DRE. Acesso pelo link "Classificar sangrias antigas" no Movimentar caixa.

---

## PDV balcão (/pdv)

**Para que serve:** o atendente lança o pedido de balcão, cobra na hora e manda para a cozinha.

**Como fazer**
1. Toque nos produtos (abas de categoria ou "Buscar produto…"). Ajuste a quantidade com "+" e "−".
2. Escolha "Comer aqui" ou "Viagem" e, se quiser, "Nome do cliente / obs (opcional)".
3. Para cobrar: "Cobrar e finalizar". Para só mandar para a cozinha e receber depois no caixa: "Só enviar pra cozinha (pago no caixa)".
4. Na cobrança: desconto em R$ ou %, ou o botão "Funcionário" (desconto da forma em um item, escolhido na tela); escolha a forma de pagamento.
   - Dinheiro: "Valor recebido" para calcular o troco.
   - Pix: QR na tela (fecha sozinho quando cai). Recebeu pela chave: "Recebi o Pix pela chave (sem QR) — concluir".
   - Cartão no pinpad: passa pela maquininha.
   - Saldo cliente: escolha o cliente. Compra da equipe: escolha o funcionário. Cortesia: motivo obrigatório. Vale-presente: código.
   - Cliente opcional para cashback ("Usar cashback").
5. "Confirmar e enviar pra cozinha". Depois, "Nova venda".

**Regras e avisos**
- "O desconto precisa ficar abaixo do total. Pra dar de graça, use Cortesia."
- Vale com saldo menor que a venda: no PDV não dá para completar com outra forma; lance pelo caixa do salão.
- "Nenhum caixa aberto — a venda foi registrada, mas não entrou no caixa."
- Se a cobrança falhar depois do pedido ir para a cozinha, a comanda fica aberta para receber no caixa (a mensagem diz o número).
- Combos não são vendidos no PDV nem no garçom.

---

## Cardápio e config (/salao/cardapio)

**Para que serve:** um cardápio só para salão, garçom, PDV e app do cliente. Em cada produto se escolhem os canais, a foto e a disponibilidade.

**Como fazer**
- *Categoria:* "Nova categoria" → "+ Adicionar categoria". Ordem com ▲ ▼; "Ativa em N canais ▾" escolhe App, Garçom e PDV; o relógio define horários no app; "✓ Disponível / ✕ Indisponível" liga e desliga a categoria toda.
- *Produto:* dentro da categoria, "Novo produto..." → "+ Produto". "Editar": preço, "Promoção (R$)" (vazio = sem), descrição (aparece no app), canais, "Disponível (desmarque se esgotou)", "Vendido por kg (pede o peso)", foto → "Salvar". Na lista: App/Garçom/PDV clicáveis (verde = aparece), "✓ Disponível", "Ocultar"/"Mostrar", "Adicionais" (só os ativos aparecem na comanda) e "Remover".
- *Pizzas:* "Quando as pizzas aparecem no app" → "Salvar horário das pizzas". Novo sabor: nome, salgada ou doce (coluna do rodízio), se entra no rodízio, descrição e preço por tamanho (vazio = não vende nesse tamanho) → "+ Adicionar sabor". "Tirar do cardápio" tira o sabor (vendas antigas ficam).
- *Combo (só delivery e app):* "+ Criar combo". Na tela do combo: "Disponível pra venda" → "Salvar detalhes"; "Adicionar etapa" com nome, quantas opções ("Apenas uma opção", "Mais de uma, sem repetição", "Mais de uma, com repetição"), "Obrigatório escolher", "É uma pizza: cobra a média dos sabores", e as opções com o "Valor no combo" ("Puxar com o preço do cardápio", produto do cardápio ou "Adicionar opção") → "Salvar etapas".
- *Configurações do buffet / serviço / cupom:* "Qtd. de mesas", "Tara padrão (kg)", "Preço por kg", "Buffet livre (teto R$)" (0 = desligado), preços por dia da semana (vazio = usa o geral), "Serviço (%)" e "só à noite, a partir de", dados do cupom → "Salvar configurações".

**Regras e avisos**
- Excluir categoria não apaga os produtos.
- O combo nasce indisponível; só aparece no app quando ligar "Disponível pra venda". Precisa de pelo menos uma etapa, cada etapa com nome e opções, e o "de … até …" coerente.

---

## Notas fiscais (NFC-e) (/salao/notas-fiscais)

**Para que serve:** todas as notas emitidas pelo sistema, com cartões "Emitidas", "Valor total emitido", "Canceladas" e "Com erro".

**Como fazer**
- Buscar por comanda, número da nota ou chave (Enter), filtrar por status e modelo, "Buscar". "XLS" baixa a planilha.
- Em cada nota: "Imprimir" (manda para a impressora de NFC-e), "PDF", "XML", "Consultar" (NF-e que ficou processando) e "Cancelar".
- *Cancelar uma nota:* "Cancelar" → justificativa com pelo menos 15 caracteres → "Cancelar a nota". É cancelada na Receita e não dá para desfazer. Se a SEFAZ demorar, a situação atualiza sozinha em até meia hora.
- *Nota avulsa:* "+ Nota avulsa (NF-e / NFC-e)".

### Nota avulsa (/salao/notas-fiscais/avulsa)
NF-e para empresa ou NFC-e para consumidor, fora do caixa, em 4 passos:
1. "Tipo de nota" (NF-e modelo 55 ou NFC-e modelo 65). "Nota de teste (homologação, sem valor fiscal)" para testar.
2. "Quem compra": busque o cliente cadastrado ou digite o CNPJ e clique em "Buscar" (preenche pela Receita). Na NFC-e é opcional.
3. "Itens": digite os itens ou use "Puxar compras" (junta as comandas fechadas no nome do cliente no período). "+ item" para mais linhas.
4. "Pagamento e observação": escolha a forma e, opcionalmente, "Dar baixa no saldo do cliente" e/ou "Lançar no caixa". Clique em "Emitir NF-e"/"Emitir NFC-e" e confirme.

**Regras:** a nota vale na SEFAZ; para desfazer, só cancelando (até 24 h). Puxar compras e dar baixa exigem cliente do cadastro; a baixa não passa do saldo nem do total. "Lançar no caixa" exige caixa aberto. Se avisar que comandas "já entraram numa nota avulsa", confira para não faturar duas vezes. Sem nada marcado, a nota não mexe no caixa nem no faturamento.

---

## Cancelados (/salao/cancelados)

Auditoria das comandas excluídas e itens cancelados: o quê, motivo, valor, quem fez e quando. Só consulta.

---

## Balança do buffet (/salao/balanca)

**Para que serve:** gerar comandas de buffet pelo peso e acompanhar o programa da balança. Mostra o preço do kg do dia (ou "preço não definido no Cardápio").

**Como fazer**
- *Na mão:* em "Ou digitar na mão", preencha "Peso do prato (kg)" e "Tara (kg)" → "Gerar comanda".
- *Leitura direta (Chrome no PC):* "Conectar balança", escolha a porta e "Gerar comanda" com o peso lido.
- *Autoatendimento:* "Modo quiosque (autoatendimento)": o cliente pesa e pega o cupom. Botões: "QUERO O BUFFET LIVRE", "VOLTEI AO BUFFET" (soma na comanda que já tem, pelo QR do cupom), "JÁ PESEI, QUERO VIRAR LIVRE" e "É MARMITA?" (cobra o peso inteiro). A engrenagem configura impressora, voz e "Imprimir teste".

**Regras e avisos**
- Mostra se o programa da balança está "online" ou "sem sinal", e avisa pesagens na fila offline (sincronizam sozinhas quando a internet do PC volta).
- Pesagens recusadas: o cliente levou o cupom mas a comanda não entrou no caixa. Lance na mão pelo número do cupom.
- "A tara é maior que o peso." / "Peso de X kg não parece um prato": confira os números (em kg, ex.: 0,452).
- Comanda que já é buffet livre não soma peso ("pode servir à vontade").

---

## Quadro do rodízio (tablet) (/cozinha)

Fila dos pedidos do rodízio que o garçom lança. Em cada pedido: "No forno", depois "✓ Pronto"; ou cancelar ("Cancelar o pedido"). Atualiza sozinho. "Este pedido já mudou de status." = outra tela já mexeu.

## Rodízio · relatório (/cozinha/relatorio)

Escolha o período e clique em "Ver": pizzas pedidas, doces, tempo médio até pronto, cancelados, sabores mais pedidos e pedidos por mesa.

## Recados da TV (/cozinha/recados)

Quando não tem pedido do rodízio, a TV da cozinha mostra relógio, data e estes recados (até 5 ativos). Escreva o recado, "Mostrar até (opcional)" e "Colocar na TV". Em cada recado: "Editar", "Desligar"/"Ligar" e "Apagar". Recado com data some sozinho depois dela.

---

## Reservas (/reservas)

**Para que serve:** as reservas do site caem aqui. A equipe confirma, remarca, fecha datas e lança a reserva de quem ligou.

**Como fazer**
- "← dia anterior" / "próximo dia →". "Como está o dia" mostra a lotação por turno e quantos lugares restam; "Próximos 15 dias", a dos próximos dias.
- Em cada reserva: "Confirmar", "Chegou"/"Desmarcar chegada", "Editar" (dia, turno, pessoas, mesa, situação etc. → "Salvar alterações"), mensagens de WhatsApp ("Confirmar", "Aguardar", "Sem mesa"), "Cancelar" e "Apagar" (de vez).
- *Quem ligou:* "Lançar reserva (quem ligou)" → "Salvar reserva".
- *Fechar datas:* dia, turno (ou "Dia todo"), motivo opcional → "Fechar". Some do site; "liberar" reabre.
- "Ajustes: lotação e mensagens": "Máx. reservas", "Máx. pessoas" e "Grupo grande" por turno, e os textos (use {nome}, {data}, {turno}) → "Salvar ajustes".
- "Ver no celular" abre a tela de hoje.

**Regras:** reserva precisa de nome, telefone e dia, e pelo menos uma pessoa. A partir do número de "Grupo grande", a reserva do site entra como "aguardando" para confirmarem as mesas antes. Situações: nova, aguardando, confirmada, cancelada.

### Reservas de hoje no celular (/reservas/hoje)
Tela da recepção: reservas do dia com totais (reservas, pessoas, chegaram), "Mostrar só quem ainda não chegou", definir a mesa e "✓ Chegou".

---

## Etiquetas de validade (/etiquetas)

**Para que serve:** gerar etiquetas de manipulação e controlar a validade dos insumos.

**Como fazer**
1. Em "Nova etiqueta" escolha o tipo: Manipulação, Fracionamento, Descongelamento, Amostra (72 h) ou Livre (título + texto).
2. Escolha o item, a conservação (Congelado, Resfriado, Ambiente), quantidade e unidade. A validade vem do cadastro do item (atalhos de 3, 7, 15 e 30 dias). "Observação (opcional)" sai impressa acima da validade.
3. O responsável é sempre quem está logado. Escolha a impressora em "Imprimir na" e as cópias (cada cópia é uma etiqueta própria, com número e QR diferentes).
4. "Gerar etiqueta".
- "Painel de vencimentos" e a faixa de dias filtram o que vence ("Vencidas não baixadas", "Baixadas"). Abas "Ativas" e "Histórico (baixadas)".
- Em cada etiqueta: "Imprimir", "Dar baixa" (usada), "Descartar" ou "×" (excluir).
- "Impressas": quantas saíram, por hora, pessoa e produto. "Itens e categorias": cadastre itens ("＋ Novo item") com a validade em dias por conservação.
- "Modo Leitor": "Ligar câmera", escolha "Dar baixa (usada)" ou "Descartar" e aponte para o QR; a baixa é automática.

**Regras:** quantidade e validade são obrigatórias (na Livre, o título). Excluir um item não apaga as etiquetas já impressas.

---

## Central de impressões (/impressao)

**Para que serve:** todas as impressoras do sistema. As impressões saem por um PC central com o programa de impressão (Agente) instalado.

**Como fazer**
- Veja se o PC está "Recebendo as impressões normalmente". Se não, instale ou abra o Agente; enquanto isso nada é impresso.
- Cadastre as impressoras detectadas no PC, ou digite o nome e "+ Adicionar impressora".
- Em cada impressora: "testar", "renomear", "desativar"/"reativar", a impressora do Windows ("Salvar") e as caixinhas "Recebe comandas (cozinha/bar)" (com "Recebe as pizzas montadas", os produtos que imprime e o formato), "Etiquetas das marmitas" e "Imprime o cupom da NFC-e".
- "Formato da etiqueta": tamanho, QR code, validade em barra preta, categoria e calibração (moldura saiu para baixo = vertical negativo; para a direita = horizontal negativo).
- "Pedidos que não saem em nenhuma impressora de cozinha" lista produtos sem impressora (ignore se for de propósito, ex.: bebidas do bar).

**Regras:** só uma impressora imprime o cupom da NFC-e (é nela que saem a nota, o Z, o vale e a via do cartão) e só uma recebe as marmitas.

### Downloads (/impressao/downloads)
Instaladores do programa de impressão (PC central), da balança (PC do buffet) e do pinpad (cada PC de caixa com pinpad). Abra a página no PC onde vai instalar e clique em "Baixar". Para atualizar, instale por cima; o instalador pede o token, que está na Central de impressões em "ver dados do agente".
