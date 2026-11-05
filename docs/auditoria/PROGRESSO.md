# Auditoria geral do sistema — progresso

Começou em 30/10/2026, com a versão `a663b81` no ar.

Para continuar depois de uma pausa (ou numa sessão nova):
> Continue a auditoria geral. Leia `docs/auditoria/PROGRESSO.md` e siga de onde parou.

## Regras que valem pra todas as etapas

- Nesta fase só se investiga. Não se corrige nada.
- Arquivos novos só em `docs/auditoria/` e `scripts/auditoria/`. O commit desses dois é separado do resto.
- Banco de produção: só leitura. Os scripts usam `scripts/auditoria/db.mjs`, que liga `default_transaction_read_only` e se recusa a seguir se a sessão não ficar só leitura.
- Nada sai pro mundo real: NFC-e, Pix, WhatsApp, impressora, SEFAZ e cron ficam como "verificado por leitura, não executado".
- Uma etapa por vez. No fim de cada uma: salvar o relatório, atualizar este arquivo, mostrar o resumo e parar.
- Toda lentidão citada precisa de número medido.

## Etapas

| # | Etapa | Status | Relatório |
|---|---|---|---|
| 0 | Preparação e inventário | **concluída (30/10)**; respostas do Rafael em 31/10 (abaixo) | `00-inventario.md` |
| 1 | Desempenho e lentidão | **concluída (31/10)**; esperando o "seguir" do Rafael | `01-desempenho.md` |
| 2 | Saúde do código | não começou | `02-codigo.md` |
| 3 | Varredura de todas as telas | não começou | `03-telas.md` + `prints/` |
| 4 | Bugs de lógica e dados | não começou | `04-bugs.md` |
| 5 | Segurança e banco | não começou | `05-seguranca-banco.md` |
| 6 | Integrações e o que roda fora do navegador | não começou | `06-integracoes.md` |
| 7 | Interface, consistência e acessibilidade | não começou | `07-interface.md` |
| 8 | Relatório final e plano de correção | não começou | `RELATORIO-FINAL.md` |

## Respostas do Rafael à Etapa 0 (31/10)

1. Ferramentas: **pode instalar** `playwright-core` e `lighthouse` só em `scripts/auditoria/` (package.json próprio, node_modules fora do git).
2. Login do robô: **o login do próprio Rafael**. Ele digita e-mail e senha na janela do robô; a sessão fica no scratchpad e é apagada no fim. O robô só faz GET e bloqueia qualquer outra requisição (exceto RPC só de leitura).
3. Telas que gravam ao abrir: **pode medir as 4 idempotentes** (cotações vencidas, sync das marmitas em /pedir e /delivery/novo, sync dos 10% em /colaboradores/semana, /cotar). `/cotacoes/[id]/fornecedores` fica sempre de fora.
4. Etapa 3: **só leitura**, sem salvar nada (sem projeto de teste).

Horário: medir com o robô fora do serviço (almoço 11:30–14:00 seg–sáb; noite 18:30–22:00 sex e sáb). Domingo não tem serviço.

## Onde parou

Etapa 1 concluída em 31/10 às ~20h20. Relatório em `01-desempenho.md` (DES-001 a DES-009, tabela das 131 medidas, top 5 correções rápidas). Próxima: **Etapa 2 (saúde do código)**, só quando o Rafael mandar seguir.

- O perfil do robô (com o login do Rafael) continua em `<scratchpad>/perfil-robo`: serve pros prints da Etapa 3. **Apagar no fim da auditoria.**
- Medidas cruas: `<scratchpad>/medicao.json` (fora do git; o anexo do relatório tem a tabela).

**Parado em 03/11, ~18h50, a pedido do Rafael (saiu e fechou o notebook).** Antes de seguir:
- **DES-010 (espera de 3,9 s depois do cartão/Pix):** correção pronta, com o OK dele, mas **sem commit e sem publicar**: está
  só na pasta do projeto, em `src/lib/tef-guarda.ts`, `src/lib/tef-venda-server.ts`, `src/components/cobrar-pinpad.tsx`,
  `salao/caixa/receber.tsx` e `salao/caixa/pagamentos.tsx`. Passou 44 de 44 verificações contra o agente e o
  simulador em pasta isolada. Falta: revisão independente (interrompida antes do fim), publicar fora do serviço e um teste
  de R$ 1 do Rafael no pinpad, cancelando depois.
  Em 05/11 a revisão terminou: 6 casos de exceção e um texto do PDV, todos corrigidos (53 de 53 verificações). Sobra um caso:
  PC cair nos ~3 s depois de o CNF sair, o agente desfaz ao religar e a linha fica "confirmada"; só some com versão nova do
  agente. Riscos que já existiam, para a Etapa 4: a resposta de `pagarSelecao` perdida desfaz o cartão com a venda gravada
  (`receber.tsx`, `cobrar-pinpad.tsx`), e o Pix de teste em `tef-lista.tsx` não passa pela guarda.
- **BUG-006:** esperando o OK dele.
- **Baixa pela nota (pedido novo):** ver "Saldo do cliente × nota avulsa" abaixo. Falta combinar e fazer.
- O cenário de teste do agente real: na 1ª rodada, uma venda de teste de R$ 10 foi ao agente real deste notebook
  (homologação, sem pinpad) por erro do teste. Voltou "Erro ao consultar PINPAD", sem cobrança e sem pendência.

## Scripts da auditoria (todos só leitura)

| Script | O que faz |
|---|---|
| `scripts/auditoria/db.mjs` | Conexão com o banco travada em só leitura (base dos outros) |
| `scripts/auditoria/mapa-rotas.mjs` | Lista as telas e as rotas de API, quem acessa e quantas consultas tem cada arquivo (`--json` pra máquina) |
| `scripts/auditoria/ferramentas-banco.mjs` | Versão, extensões, `pg_stat_statements`, tamanho e as maiores tabelas |
| `scripts/auditoria/pendencias-banco.mjs` | Policies `USING (true)` e funções SECURITY DEFINER abertas sem login |
| `scripts/auditoria/rpcs-que-gravam.mjs` | Quais funções do banco gravam alguma coisa (pra saber quais telas o robô não pode abrir) |
| `scripts/auditoria/js-por-rota.mjs` | JavaScript de 1ª visita por tela (gzip), a partir do `next build` |
| `scripts/auditoria/consultas-lentas.mjs` | Top consultas do `pg_stat_statements` (total e média) e planos `EXPLAIN (GENERIC_PLAN)` com RLS |
| `scripts/auditoria/medir-telas.mjs` | Robô (Chrome instalado) que mede cada tela: pronta, TTFB, LCP, clique no menu (RSC), requisições; bloqueia tudo que não é GET |

## Achados abertos (contagem por etapa)

Etapa 1: 10 achados (DES-001 a DES-010) — 3 altos (DES-002 /financeiro/banco, DES-006 fotos do /pedir, DES-010 espera de 3,9 s no pagamento com cartão/Pix), 6 médios, 1 baixo. Detalhes no `01-desempenho.md`.

A Etapa 0 só registra observações, que viram itens nas etapas certas. Os achados abaixo
chegaram pelo uso, antes da etapa deles, e passam pro relatório da etapa quando ela começar.

### [BUG-001] Pix da maquininha some se o caixa sai da comanda enquanto o QR está no pinpad
- Severidade: crítico
- Onde: `src/app/(painel)/salao/caixa/pagamentos.tsx` (`passarNoCartao`), `agente-tef/agente.mjs` (`desfazerPendenteAntes`)
- O que acontece: o caixa manda o Pix pro pinpad e sai da comanda. O cliente paga, o agente
  recebe "aprovado" e guarda como pendente, mas a tela que esperava a resposta não existe mais,
  então nada é gravado. Na próxima venda no pinpad o agente desfaz (NCN) o Pix pendente, e o
  aviso vermelho aparece na conta de OUTRO cliente.
- Como reproduzir: verificado por leitura, não executado (é pagamento real).
- Evidência: 31/10, comanda 238 (Balança). Conta das comandas 238+239 = R$ 129,37. R$ 100 em
  dinheiro entraram às 14:11:16 (fechou a 239 e pagou parte da 238). Ficaram R$ 29,37 em aberto
  na 238, que o Rafael pôs no Pix do pinpad e saiu da comanda. Não existe nenhum registro de
  R$ 29,37: nem em `tef_transacoes`, nem em `pix_cobrancas` (zero cobranças do QR da tela no dia),
  nem em `pdv_caixa_mov`. A venda seguinte no mesmo pinpad (comanda 360, débito R$ 56,66,
  14:12:20) é o ponto em que o agente teria desfeito o Pix. O log do agente fica no PC do caixa
  (`C:\ProgramData\AgenteTEF\agente.log`), não neste. O Rafael confirmou no extrato: o Pix foi
  estornado pro cliente. O cliente pagou certo, recebeu de volta, e a conta ficou R$ 29,37 a menos.
- Causa provável: a resposta do pinpad só é tratada pela tela aberta. Não existe registro da
  transação aprovada no servidor antes de a venda ser gravada, e a regra do agente é "sem venda
  gravada, sem cobrança" (desfaz).
- Correção proposta: (1) travar a saída da comanda enquanto o pinpad espera, com aviso;
  (2) Pix ou cartão aprovado sem tela pra receber vira "pagamento recebido sem comanda" (CNF +
  registro avulso), com botão pra ligar numa comanda, em vez de ser desfeito; (3) o aviso de
  "desfeito" não pode aparecer na conta de outro cliente. Decisão do Rafael: manter "desfaz"
  ou passar a "guarda e liga depois".
- Esforço: M
- Risco da correção: médio (mexe no fluxo do TEF em produção; testar com o simulador do agente)
- Depende de: decisão do Rafael no item (2). Ele decidiu em 31/10: guardar, não devolver.
- **Corrigido em 31/10 (fora da ordem da auditoria, a pedido do Rafael).** Sem mexer no agente
  do PC do caixa: `src/lib/tef-guarda.ts`, "Recebido sem conta" no Pagamento do caixa, venda
  liga a linha guardada (`transacaoSemConta`). Continua desfazendo um único caso: o agente
  reiniciar com um pagamento pendente (`recuperar()` no agente), que só muda com uma versão
  nova do agente instalada no caixa.
- Revisão independente (31/10) achou falhas raras na primeira versão, corrigidas em seguida:
  "Usar nesta conta" num PC sem pinpad marcava a transação como desfeita; falta de conexão
  depois do CNF perdia o registro (agora fica numa fila no navegador); desfazer que o agente
  não respondeu passava a ser confirmado pela guarda (agora é desfeito); duas abas no mesmo PC
  (a guarda espera 60 s antes de mexer num pagamento recém-aprovado de outra tela); pagamento
  "sem conta" usado em duas vendas (a venda confere antes e só liga linha livre).

### [BUG-002] "Ver outro dia" da tela inicial não abria o calendário
- Severidade: baixo
- Onde: `src/app/(painel)/dashboard/inicio.tsx`
- O que acontece: o botão é um campo de data invisível por cima. No Chrome do computador,
  clicar no meio do campo só marca dia/mês/ano; o calendário abre pelo ícone, que fica escondido.
- Evidência: relato do Rafael com print (31/10).
- Correção: o clique chama `showPicker()`. **Corrigido em 31/10.**

### [BUG-003] Comanda paga fica aberta quando o último item que faltava é excluído depois do pagamento
- Severidade: médio
- Onde: `src/app/(painel)/salao/actions.ts` (`removerItemCaixa`, `removerItemComanda`); o fechamento
  automático (`fecharSeQuitou`) só roda dentro do pagamento
- O que acontece: a comanda só fecha sozinha no fim de um pagamento, se não sobrar nada. Se sobrou
  um item e ele é excluído depois (no caixa ou pelo × da comanda), a comanda fica aberta com R$ 0
  a pagar. Não tem botão pra fechar (Excluir é barrado porque já teve pagamento, e está certo).
  O dinheiro está certo e o fechamento do caixa não trava (a trava só conta comanda com valor a
  receber), mas a mesa aparece ocupada e o garçom que digitar o mesmo cartão abre essa comanda
  velha, com os itens pagos (`acharComanda` procura cartão com status aberta).
- Como reproduzir: verificado por leitura e pelos horários do banco, não executado.
- Evidência: 31/10, comanda 171 (Mesa 17). 22:14:36 o caixa divide o "Rodizio Tradicional Kids"
  em 2; 22:16:14 débito de R$ 335,15 paga a 171 (R$ 245,25) + R$ 89,90 da 152, mas a metade
  "Kids (1/2)" (R$ 44,95) ficou de fora; 22:18:05 essa metade é excluída no caixa ("Lançado em outra
  comanda"). Resultado: 6 itens, todos pagos, status `aberta`. Nos últimos 30 dias é o único caso.
- Causa provável: `removerItemCaixa` e `removerItemComanda` não chamam `fecharSeQuitou` depois de apagar.
- Correção proposta: chamar `fecharSeQuitou` depois de excluir um item (só se a comanda já teve
  algum pagamento); fechar a 171 (status `fechada`, forma "Dividido", serviço 0).
- Esforço: P
- Risco da correção: baixo
- Depende de: OK do Rafael (fecha a 171 = gravação no banco de produção).
- **Corrigido em 31/10 (fora da ordem da auditoria, com o OK do Rafael).** `fecharSeJaRecebeu` roda
  depois de excluir item (caixa e ×) e só fecha comanda que já recebeu alguma coisa. A tela da
  comanda mostra "Fechar comanda" quando ela está aberta e toda paga, com o serviço que de fato
  entrou. A gravação direta da 171 no banco foi recusada pela permissão da sessão; ela fecha
  por esse botão.

### [BUG-004] Fator da nota em peças quando a contagem é em caixa/pacote infla o consumo e zera o preço de referência
- Severidade: médio
- Onde: `nota_itens.fator` (tela da nota, `item-fator.tsx`); a cópia automática do fator da última nota
  do mesmo item/fornecedor em `src/app/(painel)/notas/actions.ts` espalha o erro; quem usa o fator:
  `consumo_periodos` (0244), preço de referência (`notas/actions.ts`), CMV (`financeiro/cmv`)
- O que acontece: a nota vem "1 CX c/ 100 luvas" e o fator ficou 100, mas a contagem conta a caixa
  (1, 2). Entre duas contagens o consumo vira "tinha 2 + chegou 920 − tem 3 = 919", e a média da
  semana dispara. O preço de referência vira preço da peça (luva R$ 0,30 em vez de R$ 30,46 a caixa),
  então o valor desses itens no estoque fica quase zero.
- Como reproduzir: verificado por leitura no banco, não executado.
- Evidência: 03/11, relato do Rafael com print (EMB PLAST ALIM 30x39: média 337, semana de 14/09 = 919).
  Nota "C/1X920" com fator 920 em 10/09, 13/10 e 23/10; contagem sempre 2 ou 3. Mesmo padrão em 17
  produtos (44 linhas de nota): luvas nitrílicas, sachês, embalagens plásticas, sacos de lixo, canudos,
  palito, sacola, pano, guardanapo (este conta pacote: fator certo seria 12, o fardo).
- Causa provável: o fator foi digitado como "quantas peças" e não "quantas unidades da contagem";
  depois a nota seguinte copia o fator anterior sozinha.
- Correção proposta: (1) acertar o fator das 44 linhas e recalcular o preço de referência (gravação
  em produção, precisa do OK); (2) avisar na nota quando o fator deixa a entrada muito acima de tudo
  que já foi contado; (3) na tela de Consumo, marcar o trecho em que "chegou" é desproporcional em vez
  de jogar na média.
- Esforço: P
- Risco da correção: baixo (mexe só nesses itens; o valor em R$ das notas não muda)
- Depende de: OK do Rafael e confirmar que esses itens são contados por caixa/pacote.
- **Corrigido em 03/11 (fora da ordem da auditoria, com o OK do Rafael).** `scripts/corrigir-fator-por-pacote.mjs`
  acertou 46 linhas de nota (as 44 + 2 do guardanapo que estavam ×1) e o preço de referência dos 17
  produtos, e recalculou os 16 pedidos ligados (divergências de 149 para 79). Migration 0270: trecho
  com fator acima de 5× a maior contagem fica fora da média e aparece como "a conferir" na tela de
  Consumo; a tela da nota avisa ao digitar. Sobrou marcada só a Farinha de Pizza 25Kg (cadastro em kg,
  nota ×25, contagem em sacos): o Rafael confirmou que contam por saco e trocou na tela da nota (×1;
  a unidade ficou "un", 1 un = 1 saco). Nada mais marcado em 03/11.

### [BUG-005] Contagens importadas com o mesmo horário inflam a barra do consumo na semana de 17/08
- Severidade: baixo
- Onde: `consumo_periodos` (migrations 0244 e 0270): ordena e separa os trechos por `contagens.criado_em`
- O que acontece: a importação da Planilha CMV (20/08, 00:17) criou 3 contagens de datas antigas (03/08,
  09/08, 16/08) com o mesmo `criado_em`. Viram trechos de 0 dias, com o mesmo fim, e o `left join` por
  `fim` repete a entrada do trecho anterior em todos eles.
- Como reproduzir: verificado por leitura no banco.
- Evidência: 03/11, print do Rafael (tampa TP 200, semana de 17/08 = 6.530). Conta: (800 + 860 + 840)
  em 2,68 dias × 7 = 6.530. As semanas seguintes dão de 315 a 530 e a média de 402 está certa. 241 produtos têm
  esses trechos; em 126 a barra fica acima de 3× o normal.
- Alcance: só a barra da semana de 17/08. A média e o "gasta ~X por semana" usam 8 semanas (desde
  08/09) e não pegam esses trechos. A barra sai sozinha em 09/11, quando a janela de 12 semanas anda.
- Correção proposta: nessa conta, ignorar contagem e pedido com `criado_em` mais de 2 dias depois da
  própria `data` (importados). Vale também para importações futuras de outros restaurantes.
- Esforço: P
- Risco da correção: baixo (função só de leitura, nenhum dado muda)
- Depende de: OK do Rafael.
- **Corrigido em 03/11 (fora da ordem da auditoria, com o OK do Rafael).** Migration 0271: o filtro pega só as 3
  contagens e os 2 pedidos da importação. Comparação antes × depois nos 359 produtos: nenhuma média de
  8 semanas mudou, nenhuma barra de 31/08 em diante mudou, trechos de 0 dias de 482 para 0.

### [BUG-006] Recebimento de fiado conta como faturamento: a mesma venda entra duas vezes
- Severidade: alto (DRE e CMV do mês)
- Onde: `receberFiado` em `src/app/(painel)/salao/actions.ts` grava `tipo: "venda"`, descrição "Fiado — cliente". Quem
  soma: `dashboard/page.tsx` (`movs`) e a função `faturamento_sistema_dias` (migration 0220), que alimenta DRE,
  CMV e Notas × Faturamento desde setembro (`faturamento_dias` termina em 31/08).
- O que acontece: a venda no fiado já entra como "Saldo cliente" no dia em que foi vendida. Quando o cliente paga,
  entra de novo.
- Como reproduzir: verificado por leitura no banco.
- Evidência: 03/11, print do Rafael (tela inicial: R$ 29.345,91, +515%). R$ 25.028,06 são 6 Pix de acerto de fiado
  (Kern R$ 22.518,84, Auto Center R$ 1.623,06, Brasa Hamburgueria R$ 449,86, Cortesia Ana e Rafa R$ 436,30). Venda
  de verdade no dia: R$ 4.317,85, 9% abaixo da terça anterior (R$ 4.768,97). Vendido no fiado em set + out:
  R$ 2.596,43 + R$ 24.757,29 = R$ 27.353,72. Recebido de fiado até hoje: R$ 2.325,66 + R$ 25.028,06 = R$ 27.353,72.
  Bate no centavo.
- Efeito: faturamento a mais de R$ 2.325,66 em setembro e R$ 25.028,06 em novembro (até 03/11). Outubro não teve
  recebimento. O CMV % de novembro sai mais baixo do que o real.
- O que está certo: o dinheiro entrou e o fechamento do caixa precisa contar esse valor na conferência por forma.
- Correção proposta: recebimento de fiado continua no caixa, mas sai do faturamento (tela inicial, DRE, CMV, Notas ×
  Faturamento), e aparece como linha própria no "Caixa do dia". Nenhum dado muda; o histórico se acerta sozinho.
- Esforço: P
- Risco da correção: baixo
- Depende de: OK do Rafael.

### Saldo do cliente × nota avulsa (pedido do Rafael, 03/11; ainda não combinado nem feito)
O que ele pediu: ligar o saldo do cliente às notas avulsas emitidas pra dar baixa e descontar do saldo, e nem toda nota avulsa
deve contar no caixa. Hoje a única baixa é "Receber" em Fiado, que exige caixa aberto e grava `pdv_caixa_mov` como venda.
- 03/11: as 3 NF-e do Kern (nº 2, 3 e 4, R$ 18.173,70, de 16 a 31/10) saíram às 12h03-12h12, cada uma num cadastro do Kern.
  As baixas das 14h09 foram por "Receber" em Pix e zeraram os 3 saldos: R$ 10.344,00, R$ 8.568,00 e R$ 3.606,84.
- Diferença de R$ 4.345,14 entre baixas e notas: débitos sem nota avulsa neste sistema. Cadastro bf3b2e8c: R$ 1.608,00 (3 linhas, 13 a
  15/10). Cadastro 18e6bcf4: R$ 1.416,00 (3 linhas, 13 a 15/10). Cadastro cdb7a95f: R$ 1.321,14 (9 linhas, 22/09 a 15/10). Nesse
  último, os R$ 149,70 de 29/10 entraram na NF-e 4 como linha "Almoços", sem a comanda ligada.
- Não se sabe ainda se esses Pix entraram mesmo no caixa ou só serviram pra zerar o saldo: é pergunta pro Rafael. O último extrato
  importado vai até 30/09, então o banco não confirma.

### Observação para a Etapa 4 (lógica e dados)
Sobra nos caixas do dia (23 de 23 caixas positivos em 30 dias, média R$ 156, total R$ 3.586; à noite, perto de
zero): o Rafael explicou em 03/11 que entra na gaveta o dinheiro do delivery do outro sistema, porque o delivery
daqui ainda não terminou. Não é erro do caixa e não vira achado por enquanto. Olhar de novo quando o delivery
migrar: a sobra deve zerar. Se não zerar, aí é investigar.

### Observação para a Etapa 7 (interface)
Gráfico da tela de Consumo (`consumo-tabela.tsx`): o texto "média X" é desenhado antes das barras, então
some atrás da última barra quando ela passa da média (visto em 03/11 na tampa TP 200).

### Observação para a Etapa 5 (segurança)
`scripts/migrate.mjs` termina toda rodada com `grant execute on all functions ... to anon`. Isso desfaz o
que a migration 0216 ("funções antigas sem anônimo") tirou: em 03/11, `anon` tem execute em
`_contagem_referencia`, `consumo_periodos` e `painel_resumo`. Verificar na Etapa 5 quais funções ficam
expostas de verdade (as que chamam `exigir_interno()` barram por dentro).
