# Etapa 4 — Bugs de lógica e dados

Feita em 08/11/2026 (domingo à noite), com a versão `89d91ab` no ar. Só leitura: código lido e banco de produção
consultado em modo só leitura (`scripts/auditoria/db.mjs`). Nada foi alterado, nenhuma rotina disparada, nenhuma API
externa chamada. Cinco frentes em paralelo (caixa/PDV/comandas; delivery/Pix/rodízio; fiscal/financeiro;
compras/estoque/equipe; cardápio/marmitas/reservas/fuso). Os achados mais graves de cada frente foram conferidos de
novo, direto no código, antes de entrar aqui.

Por privacidade (o repositório é público), pessoas aparecem só por id curto ou número de comanda.

## Resumo

58 achados: **0 críticos, 9 altos, 21 médios, 28 baixos**. Nenhum crítico porque os dois maiores problemas
encontrados nesta noite já foram corrigidos (a nota declarando dinheiro, COD-002, e a configuração fiscal aberta, TEL-001).

**Pedem decisão do Rafael antes de qualquer correção:**
1. **FIS-03** — a nota automática está **desligada desde 31/10 14:20** (`nfce_auto = 0`). As NFC-e caíram de 53–111
   por dia (26 a 31/10) para 3–9 por dia (03 a 07/11). Foi de propósito?
2. **FIN-01** — o faturamento (tela inicial, DRE, CMV, Vendas) conta os **10% do garçom** como receita. Noites de 23/10
   a 07/11: R$ 2.233,45. Depende de como a planilha antiga contava.

**Têm data pra acontecer:**
- **MAR-01** — rotação das marmitas do Kern atrasa uma semana no primeiro salvamento a partir de **14/12**.
- **MAR-02** — feriados de **25/12 e 28/12 a 02/01** marcados "fecha" não bloqueiam marmita (abre pedido em 24/12 às
  14h), reserva nem a virada do cardápio.

| Severidade | Achados |
|---|---|
| Alto (9) | CX-01, CX-02, DEL-01, DEL-02, FIS-03 (se não foi de propósito), FIN-01, EST-01, EST-02, MAR-01 |
| Médio (21) | CX-03 a CX-06, DEL-03 a DEL-08, DEL-13, FIS-01, FIN-02 a FIN-04, EST-03, EQP-01 a EQP-03, MAR-02, MAR-03 |
| Baixo (28) | o resto |

---

## Caixa, PDV, comandas e balança

### [CX-01] Dá pra excluir comanda já paga quando ela não é a primeira de um recebimento conjunto
- Severidade: **alto**
- Onde: `src/app/(painel)/salao/actions.ts:676-690` (`excluirComanda`)
- O que acontece: a trava só procura pagamento com `comanda_id = id`. Num recebimento de várias comandas,
  `comanda_id` guarda só a primeira; as outras ficam em `comanda_ids`. A função também não confere se a comanda está
  aberta nem se os itens/buffet já estão pagos. O dinheiro fica no caixa ligado a comanda que não existe, a nota perde os
  itens e o log conta o valor como "não recebido".
- Evidência: 22/10, movimento de R$ 150,15 "Comandas #309, #307, #298": as que sobraram somam 91,80; a diferença,
  R$ 58,35, é exatamente a #298, excluída 24 min depois com motivo "pago". Desde 07/10 há outros 3 movimentos apontando
  pra comanda apagada (07/10 #277, 13/10 #290, 16/10 #254), sempre a que não era a primeira. Conferido no código.
- Correção: usar as checagens do `lerParaJuntar` (aberta, buffet/itens pagos) e procurar o movimento também em
  `comanda_ids`; conferir o erro do `delete` antes do log.
- Esforço: P · Risco: baixo

### [CX-02] Exclusão de comandas da balança virou rotina pra destravar o Z, e o log não permite auditar
- Severidade: **alto** (controle de caixa)
- Onde: `salao/actions.ts:665-717`, trava do Z (`:2225-2231`, a mensagem sugere "ou exclua"), `pdv_comandas_excluidas`
- O que acontece: as exclusões saem em lote logo antes do Z. O log não guarda id, hora de abertura, peso, se era livre
  nem a origem, então não dá pra separar cupom duplicado de cliente que saiu sem pagar.
- Evidência: 05/11 — as 15 excluídas são os buracos da sequência 200–334; 10 delas em menos de 2 min (14:18–14:19),
  6 min antes do Z, R$ 394,85; 8 com o valor exato do livre (R$ 41,90), quatro seguidas (#320–#323); #247/#248/#249
  idênticas (0,400 kg, R$ 37,96), sinal de duplicação. Nos 15 min antes do Z: 21/10 11 comandas (R$ 428,95), 02/10 8
  (R$ 325,08), 09/10 7 (R$ 225,27). Em 02/10, 5 exclusões com motivo = nome de uma pessoa (R$ 230,23): consumo de
  conhecido/funcionário que devia ir pra Compra da equipe ou Cortesia. Histórico: "erro" 102× (R$ 5.224), "sobrou" 79×
  (R$ 2.983), "teste" 27×, "duplicada" 17×.
- Conclusão: parte é duplicação real de cupom (ver suspeita do quiosque abaixo), parte é consumo que não passou pelo
  caixa. Com o log de hoje não dá pra provar nem descartar venda não recebida.
- Correção: log completo (id, aberta_em, peso, livre, origem, valor recebido); motivo em lista fechada (duplicada,
  impressão falhou, desistiu, teste), consumo de funcionário obriga Compra da equipe/Cortesia; total excluído no cupom do
  Z; permissão própria pra excluir.
- Esforço: M · Risco: baixo

### [CX-03] Saldo cliente e Compra da equipe são lançados antes de saber se havia algo a receber
- Severidade: médio
- Onde: `salao/actions.ts` — `lancarFormasEspeciais` roda antes da checagem `quitadosAgora === 0`
- O que acontece: com a tela desatualizada ou outro caixa recebendo junto, o fiado (ou a retirada do funcionário) fica
  gravado e a função responde "já tinha sido recebida" sem desfazer. Se o lançamento especial falha, as comandas já
  foram fechadas sem movimento no caixa. Sem caso no banco.
- Correção: checar "nada a quitar" antes; desfazer se falhar (o ideal é uma função no banco, numa transação).
- Esforço: M · Risco: médio

### [CX-04] Dois caixas recebendo a mesma conta ao mesmo tempo lançam duas vezes
- Severidade: médio
- Onde: `pagarSelecao` — lê `pago` e faz update sem `.eq("pago", false)`
- O que acontece: duas chamadas simultâneas passam as duas. No mesmo caixa o clique duplo já é barrado. Os 6 pares de
  movimentos "gêmeos" do banco são divisões legítimas: ainda não aconteceu.
- Correção: update condicional e contar só as linhas que mudaram.
- Esforço: P · Risco: baixo

### [CX-05] Resposta perdida depois de gravar: o cartão é desfeito e a venda fica como "cartão" sem ter sido cobrada
- Severidade: médio (suspeita apoiada no código; já anotada na Etapa 1)
- Onde: `salao/caixa/receber.tsx:554-560`
- Correção: chave de recebimento (idempotência); no erro, perguntar ao servidor se gravou antes de desfazer.
- Esforço: M · Risco: médio

### [CX-06] Desconto de 100% no caixa fecha a comanda sem pagamento e sem motivo
- Severidade: médio
- Onde: `receber.tsx:366-367`; `pagarSelecao` não valida desconto nem a soma dos pagamentos contra o devido
- O que acontece: o PDV recusa (manda usar Cortesia), o caixa do salão não. Zero casos desde 01/10. Relacionado: #240
  (07/10) recebeu R$ 77,91 em vale pra R$ 40,90 devidos e #266 (02/10) R$ 62,32 pra R$ 40,57 — o servidor não confere.
- Correção: `descontoValido` no servidor e conferir pagamentos + desconto contra o devido.
- Esforço: P · Risco: baixo

### Baixos do caixa
- **[CX-07]** Funções antigas sem uso e perigosas exportadas: `pagarValores`, `receberComandas`, `fecharComanda` e
  `reabrirComanda` (as duas últimas sem `exigirAcesso`, apagam e regravam a venda, inclusive TEF e Pix); `dividir-conta.tsx`.
  Remover.
- **[CX-08]** Dividir item em 3, 6, 7 ou 9 partes perde centavos (`actions.ts:2339`, qtd com 3 casas: R$ 90 em 3 = 89,91).
  Na nota, a fração sai como "KG" (`fiscal-actions.ts`, unidade KG sempre que a quantidade não é inteira): "Coca 1/3" vira
  0,333 KG; item vendido por kg com peso inteiro sai "UN". 17 itens fracionados no banco. Decidir a unidade por
  `pdv_itens.por_kg` e a última parte com o resto.
- **[CX-09]** O campo peso tem dois sentidos: no formulário manual é bruto (desconta a tara), no quiosque já é líquido;
  somar/repesar/juntar tratam sempre como líquido (#203, #204, #209, #211 de 21/10, tara 0,714). E "0.452" vira 452 kg
  (ponto lido como milhar) e a comanda vira livre sem aviso.
- **[CX-10]** Serviço da noite some depois da meia-noite (`salao/util.ts:6-8`: "00:30" < "18:00" → 0%). Nenhum caso.
- **[CX-11]** Sangria e suprimento aceitam caixa já fechado (o `caixa_id` vem do formulário). Nenhum caso.
- **[CX-12]** Número de comanda repetido: cartão 200 e o 1º da balança (200) se cruzam; comanda esquecida repete número
  (#329 de 20/10 aberta junto com a #329 de 21/10). Índice único parcial (número) enquanto aberta; balança começando em 201.

---

## Delivery, Pix e rodízio

Contexto: 79 pedidos no banco (76 do Kern, 1 do WhatsApp, 2 do app, ambos cancelados). Nenhum Pix do app usado, cashback
desligado, cupons com 0 usos. Vários achados ainda não deram prejuízo: aparecem quando o app ganhar uso.

### [DEL-01] Pix pago no app nunca entra no caixa
- Severidade: **alto**
- Onde: `src/app/pedir/actions.ts:391`; `delivery/actions.ts:548`; `delivery/[id]/detalhe.tsx:228-235`; `src/lib/caixa-motoboy.ts:31`
- O que acontece: ao cair o Pix, só marca o pedido pago ("Pix (app)"). Nenhum movimento no caixa; o "Receber" recusa
  ("já está pago") e o caixa do motoboy só lista os não pagos. A venda fica fora do caixa e do faturamento.
- Correção: ao confirmar o Pix, lançar a venda no caixa aberto (ou numa fila que o caixa absorve).
- Esforço: M · Risco: médio

### [DEL-02] Só a tela do cliente confere se o Pix caiu
- Severidade: **alto**
- Onde: `pedir-client.tsx:445-454` (consulta a cada 4 s, só com a tela aberta)
- O que acontece: sem webhook, rotina ou botão no painel. Cliente que paga e fecha o navegador deixa o pedido "não pago";
  o app do entregador sugere "Dinheiro" e o boy pode cobrar de novo na porta.
- Correção: rotina no servidor que confere os Pix "aguardando"; mostrar "Pix pago/pendente" no painel e no app do boy.
- Esforço: M · Risco: baixo

### [DEL-03] Estorno e lista dos Pix do app pedem colunas que não existem
- Severidade: médio
- Onde: `salao/pix-actions.ts:93` e `salao/caixa/pix/page.tsx:32` leem `numero` e `total` de `delivery_pedidos`
  (a tabela tem `numero_turno`; o total é calculado). Conferido no código.
- O que acontece: a lista de Pix recebidos omite os do app sem avisar e o estorno responde "Cobrança não encontrada": não
  dá pra devolver pelo sistema o Pix de um pedido cancelado.
- Correção: `numero_turno` e o total calculado como no `receberDelivery`.
- Esforço: P · Risco: baixo

### [DEL-04] Campo de cupom aceita curinga e revela o código
- Severidade: médio
- Onde: `pedir/actions.ts:132` (`.ilike("codigo", cod)`). Conferido no código.
- O que acontece: `%` e `_` funcionam como curinga: "P%" casa com o cupom de 8% sem mínimo, e a validação devolve o
  código verdadeiro pra tela.
- Correção: `.eq("codigo", cod)` e recusar caractere fora de A–Z/0–9.
- Esforço: P · Risco: baixo

### [DEL-05] Cliente não é reconhecido pelo telefone em 74% dos cadastros
- Severidade: médio
- Onde: `pedir/actions.ts:98, 121, 271`; `delivery/actions.ts:392-400`
- Evidência: 2.441 de 3.272 telefones gravados como "(51) 99999-9999"; a busca procura só dígitos. O app cria cliente
  duplicado (cashback, promoções e aniversário vão pro duplicado); no "Novo pedido", mais de 5 dígitos não acham ninguém.
- Correção: coluna só com dígitos (gerada, com índice) e unir os duplicados.
- Esforço: M · Risco: médio

### [DEL-06] Cancelar pedido já recebido não desfaz o caixa
- Severidade: médio · Onde: `delivery/actions.ts:36-74`
- Cancelar só fecha a comanda; a venda, o fiado ou a compra da equipe continuam, e Pix pago não gera aviso de devolução.
  Bloquear o cancelamento de pedido pago ("estorne antes") ou lançar o estorno. Esforço M.

### [DEL-07] Item que o servidor não consegue montar some do pedido sem aviso
- Severidade: médio · Onde: `src/lib/delivery-core.ts:253, 262, 265`
- Combo com escolha inválida, sabor sem preço no tamanho ou item apagado é descartado em silêncio; o cliente vê "Pedido
  enviado!" e o Pix cobra menos. Recusar dizendo qual item falhou. Esforço P.

### [DEL-08] Falha ao gravar deixa pedido pela metade
- Severidade: médio · Onde: `delivery-core.ts:375, 387-423`; `delivery/actions.ts:602-627`
- Erros não conferidos: pedido criado sem itens com sucesso falso; recebimento com caixa falhando fecha a comanda como
  paga. Hoje limpo (0 órfãos). Conferir `error` e, de preferência, uma função no banco. Esforço M.

### [DEL-13] Endereço de qualquer cliente aparece só com o telefone
- Severidade: médio (privacidade) · Onde: `pedir/actions.ts:28-46` (e `meusPedidos`)
- Sem login, quem digita um telefone que já pediu recebe nome e último endereço completo. Guardar no próprio aparelho
  ou confirmar o telefone. (Vai também pra Etapa 5.)

### Baixos do delivery
- **[DEL-09]** O entregador consegue "entregar" pedido cancelado com a tela velha (`entrega-actions.ts:208-219`), e com
  o cashback ligado o gatilho credita cashback.
- **[DEL-10]** Pix confirmado em pedido cancelado vira "pago" sem aviso de devolução (`pedir/actions.ts:378-397`).
- **[DEL-11]** Limite de uso do cupom: lê e grava +1 (dois pedidos juntos contam um), cancelamento não devolve o uso, sem
  limite por cliente (o BEMVINDO vale em todo pedido).
- **[DEL-12]** Pedido entregue sem receber de dia anterior fica invisível: `6b3f918b`, retirada em dinheiro de R$ 27,00,
  entregue em 14/10 23:36, sem pagamento nem movimento há 24 dias (anterior à trava de 31/10). Lista de "entregues sem
  receber" de qualquer dia; o Rafael decide esse caso.

---

## Fiscal

### [FIS-03] A nota automática está desligada desde 31/10
- Severidade: **alto se não foi de propósito**
- Evidência: `config_fiscal.nfce_auto = '0'`; última linha em `nfce_pendentes` 31/10 14:20; NFC-e autorizadas por dia:
  26/10 53, 27/10 57, 28/10 77, 29/10 54, 30/10 111, 31/10 56 → 03/11 4, 04/11 3, 05/11 9, 06/11 8, 07/11 5. Conferido.
- Correção: perguntar ao Rafael. Se não foi ele, religar pelo botão do caixa.
- **Respondido (Rafael, 08/11): foi ele que desligou, de propósito.** Não é defeito; fica fechado.

### [FIS-01] Fila da nota: linha presa em "emitindo" e risco de nota em dobro
- Severidade: médio (latente)
- Onde: `src/lib/fiscal/pendentes.ts:39-85`; `caixa/pendentes-actions.ts:43-52`; `fiscal-actions.ts` (ref nova a cada
  tentativa, trava só em "autorizado"); `focus.ts` (fetch sem timeout)
- O que acontece: se a função cai entre "emitindo" e o resultado, a linha fica presa pra sempre. Se a Focus autoriza e a
  resposta se perde, a nova tentativa com outra ref emite uma segunda nota da mesma venda. Hoje: 0 presas, 0 comandas com 2
  notas, 1 erro de conexão.
- Correção: ref fixa por pendente/comanda (a Focus devolve a mesma nota), consultar a ref anterior antes de reemitir,
  devolver à fila o que está "emitindo" há mais de 5 min, timeout de 20 s.
- Esforço: M · Risco: médio

### Baixos do fiscal
- **[FIS-02]** NF-e "processando" só é consultada na tela do resultado (`notas-fiscais/avulsa/actions.ts:351-368`);
  quem sai deixa a nota sem baixa/caixa, e com a Focus fora a linha recebe campos nulos. Botão "Consultar" na lista.
- **[FIS-04]** Nota emitida antes da conta acabar (5 com "Pagar parte") e itens lançados depois da nota (2, R$ 32, sem
  nota); 7 de 2.814 notas com valor diferente da comanda atual.
- **[FIS-05]** CPF/CNPJ do consumidor só confere o tamanho: 6 rejeições "destinatário inválido". Conferir o dígito.
- **[FIS-06]** O buffet sai como "1 KG" com o valor total, sem o peso real (a SEFAZ aceita; a quantidade não é a real).

---

## Financeiro

### [FIN-01] O faturamento conta os 10% do garçom como receita
- Severidade: **alto** (pede decisão)
- Onde: `faturamento_sistema_dias` (migration 0274) soma `pdv_caixa_mov` venda, cujo valor inclui o serviço; o mesmo na
  tela inicial (`dashboard/page.tsx:153`).
- Evidência: 31 comandas de 06–07/11: consumo R$ 8.199,43, serviço R$ 757,04, pagamentos = consumo + serviço (ex.:
  `c3f8c4e0` = 213,80 + 21,38 = 235,18). Noites de 23/10 a 07/11: R$ 2.233,45 de serviço no faturamento. A receita fica
  maior e o CMV% menor do que é.
- Correção: tirar `pdv_comandas.servico` na função (ou guardar a parte do serviço no movimento). Antes: confirmar se a
  planilha antiga (até 31/08) contava os 10%, pra manter a comparação entre meses.
- Esforço: M · Risco: médio
- **Respondido (Rafael, 08/11): mantém como está** (o faturamento segue com os 10%). Não é defeito; fica fechado. Quem
  ler o CMV% precisa saber que a receita inclui o serviço.

### [FIN-02] Fatura do cartão lança estorno como despesa
- Severidade: médio (ainda não aconteceu) · Onde: `financeiro/fatura/actions.ts:77,91`; `src/lib/fatura.ts:142`
- `Math.abs` transforma crédito em gasto: compra de 100 estornada vira 200 de despesa. Manter o sinal e barrar a mesma
  fatura lançada duas vezes. Esforço P.

### [FIN-03] Desfazer a conciliação deixa o lançamento do extrato órfão (e gerar de novo duplica)
- Severidade: médio · Onde: `financeiro/banco/actions.ts:99-181, 267-284`
- Evidência: lançamento `53fe514a` (R$ 2.000, 21/09) idêntico à transação `4d2c849a`, que está sem vínculo. Duplo clique
  em "gerar" também cria duas despesas. Ao desconciliar, perguntar se apaga; em gerar, sair se já tem lançamento.

### [FIN-04] CMV conta a compra pela data de emissão; a regra da casa é a entrada
- Severidade: médio · Onde: `financeiro/cmv/page.tsx:185-190` (a regra está em `notas/actions.ts:426-433`)
- 32 de 270 notas desde set/2026 (R$ 38.693,82) caem em semana diferente entre emissão e entrada. Confirmar qual vale.

### Baixos do financeiro
- **[FIN-05]** Lançamento de nota com resíduo de ponto flutuante (63 lançamentos, ex.: 647,3199999999999). Arredondar.
- **[FIN-06]** Parcelas: "+1 mês" pula o mês nos dias 29–31 (31/01 → 03/03).
- **[FIN-07]** DRE com `.limit(5000)`, mas a API corta em 1000 (hoje o máximo é 466/mês: risco futuro).
- **[FIN-08]** Conciliação aceita vários Pix pra um lançamento sem conferir a soma (`27a73aaa`: R$ 105.712 × 3 Pix
  somando R$ 105.153).

---

## Compras, estoque e equipe

### [EST-01] Salvar ou finalizar a contagem no painel apaga ou zera o que o contador gravou pelo link
- Severidade: **alto**
- Onde: `contagens/actions.ts:63-74` e `contagens/[id]/contar.tsx:113-141, 167-170`. Conferido no código.
- O que acontece: o painel manda todos os produtos; o que não está com valor **na tela aberta** é apagado de
  `contagem_itens` (e no Finalizar gravado como 0). Se o contador salvou pelo `/contar` depois que o painel abriu, a
  contagem dele some, com as parcelas por local. Estraga estoque final, CMV, consumo e cotação. O painel não recarrega.
- Correção: o painel grava só o que mexeu nele e nunca apaga linha que não carregou; ou avisa "o contador salvou X itens
  depois que você abriu".
- Esforço: M · Risco: médio

### [EST-02] "Remover" contagem: um clique, sem confirmação, apaga até contagem finalizada
- Severidade: **alto**
- Onde: `contagens/page.tsx:111-118` (botão direto); `contagens/actions.ts:99-104` (sem `exigirAcesso`, erro ignorado).
  Conferido no código.
- O que acontece: apaga em cascata itens, `cmv_compras_manual`, links e atribuições, mudando o CMV de semanas passadas.
  Com cotação ligada o banco recusa, mas o erro é ignorado e o botão parece não fazer nada (36 das 39 finalizadas; 3 seriam
  apagadas na hora). Nenhuma função de `contagens/actions.ts` confere permissão.
- Correção: confirmação, recusar finalizada, devolver o erro, `exigirAcesso`.
- Esforço: P · Risco: baixo

### [EST-03] Link de contagem ainda grava em contagem finalizada
- Severidade: médio · Onde: função `contar_salvar` (não confere `status`); só a tela bloqueia.
- Aba velha muda contagem já fechada (que entrou no CMV). Recusar no banco, como já é feito no prazo da cotação.

### [EQP-01] Acerto da semana: o adiantamento que a tela mostra não é o que o servidor desconta
- Severidade: médio · Onde: `colaboradores/semana/semana.tsx:387-395` × `semana/actions.ts:175-188, 195`
- A tela desconta `min(adiantamentos abertos, valor da semana)`; o servidor só desconta adiantamentos inteiros e para no
  primeiro que não cabe. Ex.: adiantamentos de 100 e 200, semana de 250: a tela mostra "em mãos R$ 0", o servidor desconta
  só 100. Pagando pelo que a tela mostrou, a pessoa perde R$ 150. Ainda não aconteceu (2 adiantamentos, ambos certos).

### [EQP-02] O 10% de semana já paga muda se mexerem em "recebe 10%" ou no peso de alguém ativo
- Severidade: médio · Onde: `semana.tsx:240-245, 258`; `semana/page.tsx:59-61`
- A divisão de cada noite usa a configuração de hoje; a tela oferece "Lançar diferença" a todos e pode pagar duas vezes.
  Guardar a divisão no momento do acerto.

### [EQP-03] "Preencher com a escala fixa" tira os dois turnos quando a folga é de um turno só
- Severidade: médio · Onde: `semana/actions.ts:116-119` (ignora `grupo_alvo`)
- 22 folgas aprovadas têm `grupo_alvo`; em 2 de almoço a noite foi remarcada à mão depois. Sem isso a pessoa perde a
  diária da noite e a parte do 10%.

### Baixos de estoque e equipe
- **[EST-04]** Excluir pedido na conferência apaga os itens antes e, com nota ligada, termina pela metade sem avisar
  (`conferencia/actions.ts:18-27`, sem `exigirAcesso`). Nenhum caso hoje.
- **[EST-05]** Consumo médio: o pedido entra pela hora de criação e a contagem pela de abertura (11 pares em 60 dias;
  122 de 2.717 períodos com consumo negativo, 4,5%).
- **[EST-06]** Erros de gravação ignorados em contagem, conferência, cotação e acerto da semana (um clique de novo
  depois de falha no `semana_pagamentos` lança de novo).
- **[EQP-04]** 10% de cada pessoa arredondado só no lançamento: a soma pode diferir alguns centavos do "a dividir".

---

## Cardápio do dia, marmitas, reservas e horários

### [MAR-01] A rotação das marmitas do Kern vai atrasar uma semana a partir de 14/12
- Severidade: **alto**
- Onde: `src/app/api/marmitas/[[...rota]]/route.ts:419-431` (poda da programação ao salvar) e `semanaPara` (`:125-140`);
  a mesma regra em `src/lib/marmitas-cardapio.ts:61-73` (TV). Conferido no código.
- O que acontece: ao salvar os cardápios, o servidor apaga as âncoras com mais de 84 dias. Hoje só existem 07/09 (s1) e
  14/09 (s2). A partir da segunda 14/12, a de 14/09 sai da janela; sem âncora, ele recria a da semana atual com o `ativo`
  guardado, que está velho. A rotação inteira fica um passo atrás, pra sempre: app do convênio, TV, quantidades da
  cozinha e pedidos já feitos ("item fora do cardápio").
- Correção: na poda, manter sempre a âncora mais recente ≤ semana atual (ou gravar antes a âncora calculada pela
  programação completa). Nos dois arquivos. Corrigir antes de 14/12.
- Esforço: P · Risco: baixo
- **Corrigido em 08/11 (OK do Rafael; commit `8b9aea9`):** sem âncora depois da poda, a semana atual vem da programação
  completa. Simulado de 08/12/2026 a 07/06/2027: todas as semanas certas (14/12 = s3, 04/01 = s2). A cópia em
  `marmitas-cardapio.ts` não poda, não precisou mudar.

### [MAR-02] Feriado "fecha" em /feriados não bloqueia marmita, reserva nem a virada do cardápio
- Severidade: médio (com data: 25/12)
- Onde: marmitas `route.ts:155-157` (só domingo e bloqueios próprios); reservas `api/reservas/route.ts:98-108` (só
  `reservas_bloqueios`); cardápio `src/lib/dia-cardapio.ts:40-48`. A tela /feriados não copia a data pra nenhum deles.
- Evidência: 25/12 e 28/12–02/01 estão "fecha" no banco, mas os bloqueios do Kern vão só até 02/11 (antes, digitados
  duas vezes à mão) e `reservas_bloqueios` está vazio. O app do convênio abre pedido em 24/12 às 14h e a rotina das 08:35
  cria o delivery cobrando o Kern; o site aceita reserva de Rodízio em 25/12, 01/01 e 02/01.
- Correção: ler `feriados` nos três lugares. Paliativo: cadastrar as datas à mão nos dois bloqueios antes de 24/12.
- Esforço: M · Risco: baixo
- **Corrigido em 08/11 (OK do Rafael; commit `8b9aea9`):** `src/lib/feriados-fechados.ts` (situação "fecha", períodos
  abertos dia a dia) usado pelo app das marmitas (soma aos bloqueios digitados, sem gravar junto), pelas reservas (tela
  e servidor) e pela virada do cardápio (TV e app da equipe). Conferido na produção: `/api/reservas?data=2026-12-25`
  devolve "Dia todo — Feriado (Natal)"; 23/12 segue livre.

### [MAR-03] Delivery do Kern pode sair em dobro se a rotina e o botão rodarem juntos
- Severidade: médio · Onde: `src/lib/kern-delivery.ts:57-103`
- Lê `kern_delivery`, cria o pedido e só depois grava; duas execuções juntas criam dois pedidos e o segundo fica órfão,
  cobrado em "Saldo cliente". Até hoje não aconteceu (76 de 76 batem). Reservar a linha antes.

### Baixos de cardápio, reservas e horários
- **[MAR-04]** Data padrão do banco em UTC (`CURRENT_DATE`) em `contagens`, `pedidos`, `cotacoes`, `lancamentos`,
  `folgas_funcionarios`: as 12 contagens "Bebidas" de sábado 21:30 ficaram com data de domingo (a última: "Bebidas — 07/11"
  com data 08/11); 4 pedidos, 1 cotação, 1 folga. A tolerância do CMV absorve hoje. Padrão
  `(now() at time zone 'America/Sao_Paulo')::date`.
- **[MAR-05]** Rotinas automáticas falham caladas: `api/contagem/cron`, `api/entrega/limpar` e `api/kern/delivery`
  respondem 200 com erro; se a do Kern não rodar, o delivery não é criado e ninguém vê. Hoje 76/76 certos.
- **[MAR-06]** Aviso da SEFAZ mostra a hora 3h adiantada (`src/lib/sefaz/busca.ts:30-35`, sem `timeZone`).
- **[MAR-07]** Reserva sem trava de concorrência (dois no último lugar passam) e regras de domingo/Rodízio/horário-limite
  só no navegador.
- **[MAR-08]** App das marmitas: exceção de dia antigo some (só carrega de hoje−2) e lançamento duplicado do administrador
  dá "Erro interno".
- **[MAR-09]** Multiempresa latente: cardápio do dia, cardápio público e `mkt_pedidos` lidos sem filtro de empresa (vai
  pra Etapa 5, junto do delivery público e da fila fiscal).

---

## Conferido e está certo

- **Fuso:** faturamento por dia, virada do cardápio (13h30, sábado→segunda), janela das marmitas (sábado 14h → segunda
  08:30, inclusive com feriado na segunda), horários do delivery, numeração por turno, acerto do motoboy, semana de
  segunda, ponto (batida antes das 05h vai pra noite anterior) e os horários das rotinas na Vercel (UTC) batem com
  Brasília. Os 62 usos de `toISOString().slice(0,10)` usam −3h ou conta pura de data.
- **Caixa:** zero comanda fechada com valor sem movimento desde 01/10; zero item não pago em comanda fechada (BUG-003
  segue corrigido); pagar parte e juntar comandas certos; Z trava com comanda ou delivery aberto; nenhum movimento depois
  de um Z; nunca houve dois caixas abertos juntos.
- **Fiscal:** 2.818 NFC-e em produção, nenhuma comanda com duas autorizadas; 2.807 de 2.814 batem com a comanda (±0,02);
  desconto e formas de pagamento repartidos em centavos.
- **Financeiro:** OFX com índice único, reimportar não duplica; sangria com categoria sem órfãos; 341 de 342 notas lançadas
  batem; contas a pagar e contagens do CMV buscam em páginas.
- **Delivery:** no /pedir, preço, taxa, cupom, promoção e cashback recalculados no servidor; cashback trava no banco e o
  cancelamento devolve; Pix só conta pago com o valor cheio no banco; rodízio sem duplicidade (mediana 6,4 min até
  ficar pronto); todo pedido pago tem um movimento igual ao total.
- **Equipe e estoque:** fiado parcial sem perder centavo; nenhum desligado com retirada aberta; prazo da cotação travado
  no banco; preço de referência bate com a última nota em 310 de 314 produtos; mesclar cobre todas as tabelas.

## Suspeitas sem prova (pra conferir quando der)

- **Duplicação no quiosque:** quando o agente demora mais de 12 s, o quiosque cria outra comanda pela nuvem, mas o
  agente pode já ter numerado e impresso a primeira (`quiosque.tsx:625-635, 256-262`). Explicaria cupons iguais seguidos
  (#247–#249, #320–#323 de 05/11) e parte do CX-02.
- 16/10, 19:44–19:46: 17 comandas de mesa e balcão (~R$ 1.900) excluídas como "Erro" em 2 min logo depois de abrir o
  caixa da noite: treinamento? Confirmar com o Rafael.
- Ponto: a presença usa a posição da batida; uma batida esquecida transforma saída em entrada e cria presença de noite.
- Rotinas só exigem a senha se `CRON_SECRET` existir na Vercel (não dá pra ver daqui).
- Receber delivery ao mesmo tempo que o fechamento do caixa do motoboy; limite por horário agendado e duas abas em
  `gerarPedidos`/`lancarPagamentosSemana` sem trava (nenhum caso).
- `contagens`, `conferencia` e `cotacoes` com várias ações sem `exigirAcesso` (Etapa 5).
