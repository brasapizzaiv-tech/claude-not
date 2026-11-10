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
| 1 | Desempenho e lentidão | **concluída (31/10)** | `01-desempenho.md` |
| 2 | Saúde do código | **concluída (08/11)** | `02-codigo.md` |
| 3 | Varredura de todas as telas | **concluída (08/11)** | `03-telas.md` + `prints/` (só local) |
| 4 | Bugs de lógica e dados | **concluída (08/11)** | `04-bugs.md` |
| 5 | Segurança e banco | **concluída (08/11)**; respondida; SEC-01/03/05/12 corrigidos | `05-seguranca-banco.md` |
| 6 | Integrações e o que roda fora do navegador | **concluída (09/11)**; 4 conferências do Rafael + 2 decisões | `06-integracoes.md` |
| 7 | Interface, consistência e acessibilidade | **concluída (09/11)**; 2 decisões do Rafael | `07-interface.md` |
| 8 | Relatório final e plano de correção | **concluída (09/11)**; correções em ondas, cada uma com o OK do Rafael | `RELATORIO-FINAL.md` |

## Respostas do Rafael à Etapa 0 (31/10)

1. Ferramentas: **pode instalar** `playwright-core` e `lighthouse` só em `scripts/auditoria/` (package.json próprio, node_modules fora do git).
2. Login do robô: **o login do próprio Rafael**. Ele digita e-mail e senha na janela do robô; a sessão fica no scratchpad e é apagada no fim. O robô só faz GET e bloqueia qualquer outra requisição (exceto RPC só de leitura).
3. Telas que gravam ao abrir: **pode medir as 4 idempotentes** (cotações vencidas, sync das marmitas em /pedir e /delivery/novo, sync dos 10% em /colaboradores/semana, /cotar). `/cotacoes/[id]/fornecedores` fica sempre de fora.
4. Etapa 3: **só leitura**, sem salvar nada (sem projeto de teste).

Horário: medir com o robô fora do serviço (almoço 11:30–14:00 seg–sáb; noite 18:30–22:00 sex e sáb). Domingo não tem serviço.

## Onde parou

**09/11/2026, fim do dia:** auditoria encerrada; correções em ondas (ver `RELATORIO-FINAL.md`, "Andamento das correções").
Onda 1 publicada e conferida. **Onda 2 (Saúde do sistema) com código pronto, a publicar** (migration 0286 + agentes
impressão 1.3.0 e balança 1.2.4 para instalar). Fora das ondas: cofre na semana, Downloads, calibração da etiqueta.
O que segue abaixo é o histórico das etapas.

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
  **Publicado em 05/11 ~12h30 (commit 88de779), com o OK do Rafael.** Falta o teste de R$ 1 no pinpad.
- **BUG-006:** corrigido em 08/11 (ver abaixo).
- **Baixa pela nota:** feita em 08/11 (ver "Saldo do cliente × nota avulsa" abaixo).

**08/11 (domingo), ~19h:** o Rafael mandou seguir. Etapa 2 começou. Correções fora da ordem feitas de 06 a 08/11, todas com o
OK dele e publicadas fora do serviço: BUG-006, BUG-008 (nota sem desconto), opções da nota avulsa, baixa do fiado sem caixa,
nota de R$ 200 no cofre, desconto do funcionário no PDV, e os 9 acertos de fiado falsos tirados do caixa (detalhes abaixo).

**Etapa 2 concluída em 08/11 à noite.** Relatório em `02-codigo.md` (COD-001 a COD-012). O mais grave é o **COD-002**: as
NFC-e do caixa declaram pagamento "Dinheiro" mesmo pagas no cartão, Pix ou vale (umas 1.228 das 1.244 notas de 30 dias).
**COD-002 corrigido em 08/11 ~19h (commit 7499bf8, OK do Rafael):** a nota usa os pagamentos da venda; NFC-e de
homologação autorizada antes de publicar. Falta conferir a 1ª nota real do caixa no cartão (segunda 09/11).

**Etapa 3 concluída em 08/11 ~21h.** Relatório em `03-telas.md` (TEL-001 a TEL-008); prints só neste PC. O login de um
funcionário mostrou que `/fiscal` (com o token da Focus e o CSC) e `/clientes` abriam pra qualquer pessoa logada:
**corrigido na hora** com o OK do Rafael (commit 89d91ab + migration 0275, conferido com o mesmo login). Sobram médios
de tela (janela de fornecedor sem rolagem, erro de hidratação em 6 telas, tela inicial cortada no celular) e contraste.
Perfis do robô: `<scratchpad>/perfil-robo` (Rafael) e `<scratchpad>/perfil-funcionario` — **apagar no fim da auditoria**.
**Etapa 4 concluída em 08/11 à noite.** Relatório em `04-bugs.md` (58 achados: 9 altos, 21 médios, 28 baixos), feito
em 5 frentes paralelas, só leitura; os mais graves conferidos de novo no código. Decisões do Rafael (08/11): **FIS-03** a nota
automática foi desligada por ele, de propósito; **FIN-01** o faturamento continua com os 10%. Os dois ficam fechados. Os dois com data,
**MAR-01** (rotação das marmitas do Kern) e **MAR-02** (feriados não fechavam marmita, reserva nem cardápio), foram
**corrigidos em 08/11** com o OK dele (commit 8b9aea9). Próxima: **Etapa 5 (segurança e banco)**, só com o "seguir".

**Etapa 5 concluída em 08/11 ~21h40.** Relatório em `05-seguranca-banco.md` (SEC-01 a SEC-19: 3 críticos, 6 altos, 9
médios, baixos). O banco separa por empresa mas não por papel; com o cadastro aberto do Supabase, a porta da internet
estava entreaberta. **SEC-01 (qualquer login virava dono) corrigido na hora** com o OK do Rafael (migration 0276,
provado como o funcionário). **Falta o Rafael desligar o cadastro aberto (SEC-02)** e responder: as 3 contas dono, as
variáveis na Vercel, o backup e o FICHAS.md do teimofit. Próxima: **Etapa 6 (integrações)**, só com o "seguir".
Respondido em 08/11: cadastro aberto desligado, backup do plano Pro confirmado. Corrigidos com o OK do Rafael, de 08 a
09/11: SEC-03 (certificado só pro dono, migration 0277), SEC-12 (webhook e rotinas), SEC-05 inteiro (migrations
0278–0280: PIN com limite de tentativas e embaralhado, chave de acesso no celular, código de uso único). Ver `05-seguranca-banco.md`.

**Etapa 6 concluída em 09/11 (segunda, madrugada).** Relatório em `06-integracoes.md`: 49 achados, 0 críticos, 0 altos,
18 médios, 31 baixos, em 5 frentes paralelas, só leitura; os principais conferidos de novo no código e no banco. Nada
quebrado hoje; o padrão é **falha calada** (agente parado, SEFAZ, Sicoob, Meta, Google e relógio não avisam ninguém).
**O Rafael confere fora do sistema:** extrato da Bin (R$ 48,90 da comanda 246 em 05/11, marcado "desfeito", PAG-01),
extrato do Sicoob (9 QR "cancelados" que continuavam pagáveis, PAG-02), painel da Focus (62 NFC-e em contingência,
NFE-01) e teto de cota no Google Cloud (CRN-02). **Decisões:** avisos de WhatsApp pros telefones do Kern (MSG-06) e Pix
pelo QR do Sicoob × Pix na máquina (0 pelo QR desde 15/10). Próxima: **Etapa 7 (interface)**, só com o "seguir".

**09/11 de manhã:** o Rafael mandou seguir pra Etapa 7 e decidiu que **todas as correções ficam pra conclusão** (Etapa 8).
**Etapa 7 concluída em 09/11 ~10h.** Relatório em `07-interface.md`: 36 achados, 0 críticos, **3 altos** (ACE-01 a pergunta
"tem certeza?" aparece depois de a exclusão já ter saído, em Apagar pedido da Conferência e Remover categoria; ACE-02
Estornar nota/Excluir fechamento/Remover lançamento sem confirmação, o estorno apaga até conta paga; TXT-01 cancelar NFC-e
com [Cancelar] [Salvar]), 13 médios, 20 baixos. Robô novo `scripts/auditoria/acessibilidade.mjs` (axe em 126 telas × 2,
09:11–09:24, só GET); o id de exemplo de `/financeiro/caixa/[id]` e `/salao/caixa/movimentos/[id]` estava errado nos
dois robôs (corrigido e medido de novo). **Decisões:** liberar o zoom em `/pedir` e `/cotar` (ACE-09); site e marmitas
ficam com identidade própria? Próxima: **Etapa 8 (relatório final e plano de correção)**, só com o "seguir".

**Etapa 8 concluída em 09/11 ~10h.** `RELATORIO-FINAL.md`: 192 achados nas 7 etapas, 14 corrigidos/fechados durante a
auditoria (mais os BUG-001 a 008), ~178 abertos, nenhum crítico. Plano em 7 ondas: **0** só o Rafael (4 conferências + 5
decisões + 1ª nota real no cartão), **1** dinheiro e nota (cliques que apagam/cancelam/duplicam), **2** falha calada (tela
"Saúde do sistema" + agentes novos), **3** segurança (SEC-04 tela por tela, Next.js), **4** velocidade, **5** travas
antes de ligar delivery próprio/cashback/campanhas/2ª empresa, **6** interface, **7** baixos. **A auditoria terminou;
daqui pra frente é correção, uma onda por vez, cada uma com o OK do Rafael** (ele pediu em 09/11 que as correções
ficassem pra conclusão). Perfis do robô ficam até o fim das correções (servem pra conferir) e depois são apagados.

Para retomar a correção numa sessão nova:
> Leia `docs/auditoria/RELATORIO-FINAL.md` e `docs/auditoria/PROGRESSO.md` e siga a próxima onda de correção aprovada.
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
| `scripts/auditoria/codigo-morto.mjs` | Arquivos e exports de `src` que ninguém importa (só lê os arquivos) |
| `scripts/auditoria/migrations-x-banco.mjs` | Migrations do repositório × `public._migrations`, números repetidos, objetos do banco sem migration |
| `scripts/auditoria/varrer-telas.mjs` | Etapa 3: cada tela em 3 tamanhos × 2 temas, sem login, token inválido e cliques seguros; só GET |
| `scripts/auditoria/varrer-funcionario.mjs` | Etapa 3: com login de funcionário, abriu × o que as permissões deixam |
| `scripts/auditoria/conferir-fiscal-funcionario.mjs` | Prova do TEL-001: funcionário não abre `/fiscal` nem lê token/CSC pela API (só lista as chaves) |

## Achados abertos (contagem por etapa)

Etapa 1: 10 achados (DES-001 a DES-010) — 3 altos (DES-002 /financeiro/banco, DES-006 fotos do /pedir, DES-010 espera de 3,9 s no pagamento com cartão/Pix), 6 médios, 1 baixo. Detalhes no `01-desempenho.md`.

Etapa 2: 12 achados (COD-001 a COD-012) — 1 crítico (COD-002 forma de pagamento da NFC-e, **corrigido 08/11**), 1 alto
(COD-001 `next` e dependências), 4 médios, 6 baixos. Detalhes no `02-codigo.md`.

Etapa 5: 19 grupos (SEC-01 a SEC-19) — 3 críticos (SEC-01 corrigido; SEC-02 com o Rafael; SEC-03 certificado), 6
altos, 9 médios. Detalhes no `05-seguranca-banco.md`.

Etapa 4: 58 achados (CX, DEL, FIS, FIN, EST, EQP, MAR) — 9 altos, 21 médios, 28 baixos. Detalhes no `04-bugs.md`. O
fato das exclusões da balança (anotado em 05/11, depois do BUG-007) virou CX-02.

Etapa 3: 8 achados (TEL-001 a TEL-008) — 1 crítico e 1 alto **corrigidos em 08/11** (configuração fiscal e clientes
abertos a qualquer funcionário), 3 médios (janela sem rolagem, hidratação, início no celular), 3 baixos. Detalhes no
`03-telas.md`.

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
- **Corrigido em 08/11 (fora da ordem da auditoria, com o OK do Rafael; commit e47d73e, migration 0274).**
  `pdv_caixa_mov.recebe_fiado`: o acerto continua na conferência do caixa e no Fechamento Z, mas sai da tela inicial e de
  `faturamento_sistema_dias`. Os 9 acertos antigos foram marcados. Conferido: 03/11 passou a R$ 4.317,85 (a venda real).
- **Os 9 acertos não eram dinheiro (Rafael, 08/11):** a Luana usou "Receber" só pra zerar o saldo. Com o OK dele, os 9
  lançamentos foram tirados do caixa (6 de 03/11, R$ 25.028,06; 3 de 30/09, R$ 2.325,66), com script que só apagava se
  achasse exatamente essas linhas e esse valor. Os saldos ficaram como ele decidiu: Kern paga ~5 dias úteis depois da nota,
  Auto Center é troca de serviço, Brasa Hamburgueria paga no dia da nota, "Cortesia Ana e Rafa" é família e amigos. O resumo
  gravado do Z de 03/11 continua com Pix R$ 25.028,06 (é a foto do que foi impresso). Para não repetir: "Dar baixa sem entrar
  no caixa" no Fiado (commit 7bcc0ea), com motivo.
- Fica para depois (Rafael): passar a lançar a cortesia de família e amigos pela forma Cortesia, fora do faturamento.

### [BUG-008] A NFC-e saía com o preço cheio quando a venda tinha desconto
- Severidade: alto (fiscal)
- Onde: `emitirNfceCore` em `src/app/(painel)/salao/fiscal-actions.ts` montava os itens pelo preço da comanda e o pagamento
  pelo total cheio. O desconto do caixa (digitado e 5% do dinheiro), do PDV (incluindo o de funcionário), o cashback e o
  cupom do delivery não chegavam na nota.
- O que acontecia: venda de R$ 42 paga R$ 29,40 saía com nota de R$ 42. No cartão e no Pix, com a nota automática, sem
  ninguém ver.
- Evidência: verificado por leitura do código em 07/11.
- **Corrigido em 08/11 (com o OK do Rafael; commits 7a2de88 e 877868c, migration 0273).** `pdv_comandas.desconto_nota`
  gravado no recebimento (caixa e PDV, com o cashback); a nota soma também `delivery_pedidos.desconto`. O desconto vai em
  `valor_desconto` de cada item, repartido pelo maior resto (`src/lib/fiscal/desconto-nota.ts`, testes em
  `scripts/desconto-nota.test.mjs`); pagamento e `nfce_emitidas.valor` ficam no valor pago. Desconto de 100% não emite.
  Falta: conferir a primeira nota real com desconto. A taxa de entrega continua fora da nota (o Rafael não pediu).

### Saldo do cliente × nota avulsa (pedido do Rafael, 03/11; feito em 08/11)
**Feito em 08/11 (commit e47d73e, migration 0274):** a nota avulsa tem "Dar baixa no saldo do cliente" (valor até o saldo e o
total) e "Lançar no caixa" (forma; com baixa vira acerto de fiado, sem baixa é venda do dia). Aplicado uma vez quando a nota
é autorizada e desfeito se ela for cancelada. Falta o primeiro uso real (nota do Kern no fim do mês). Histórico:
O que ele pediu: ligar o saldo do cliente às notas avulsas emitidas pra dar baixa e descontar do saldo, e nem toda nota avulsa
deve contar no caixa. Hoje a única baixa é "Receber" em Fiado, que exige caixa aberto e grava `pdv_caixa_mov` como venda.
- 03/11: as 3 NF-e do Kern (nº 2, 3 e 4, R$ 18.173,70, de 16 a 31/10) saíram às 12h03-12h12, cada uma num cadastro do Kern.
  As baixas das 14h09 foram por "Receber" em Pix e zeraram os 3 saldos: R$ 10.344,00, R$ 8.568,00 e R$ 3.606,84.
- Diferença de R$ 4.345,14 entre baixas e notas: débitos sem nota avulsa neste sistema. Cadastro bf3b2e8c: R$ 1.608,00 (3 linhas, 13 a
  15/10). Cadastro 18e6bcf4: R$ 1.416,00 (3 linhas, 13 a 15/10). Cadastro cdb7a95f: R$ 1.321,14 (9 linhas, 22/09 a 15/10). Nesse
  último, os R$ 149,70 de 29/10 entraram na NF-e 4 como linha "Almoços", sem a comanda ligada.
- Os Pix não entraram (Rafael, 08/11): ver BUG-006.

### Observação para a Etapa 6 (integrações)
07/11: o PDV não chamava o pinpad porque a única forma de cartão ligada nele era a genérica "Cartão" (tipo `cartao`, sem
TEF). O Rafael ligou crédito, débito e vale refeição no PDV em Formas de pagamento. Nada no código; vale um aviso no cadastro
quando uma forma de cartão sem TEF fica ligada num canal com pinpad.

### [BUG-007] Buffet que sobrou em aberto não tinha como sair da comanda já paga

Comanda 334 de 05/11: o caixa recebeu R$ 41,90 no crédito (NSU 031357) pelo produto "Buffet Livre", sem o buffet da balança
na cobrança. A comanda ficou aberta mostrando mais R$ 41,90, e a tela só tinha "×" para itens, nunca para o buffet. Único
caso igual em 60 dias.

- **Corrigido com o OK do Rafael:** a 334 foi fechada no banco, com o buffet registrado em Cancelados, sem mexer no pagamento.
- **Publicado em 05/11 (commit 02b371a):** `removerBuffetComanda` e o "×" na linha do buffet, com motivo obrigatório. Buffet
  com pagamento não sai, e `pagarSelecao` não conta como recebido um buffet já excluído em tela desatualizada.
- **Falta ver:** o "×" na tela com comanda aberta. Na hora da publicação não havia nenhuma com buffet.

**Fato para a Etapa 4, sem conclusão:** comandas da balança excluídas sem pagamento são frequentes. Em 05/11 foram 15
(R$ 589,16), 10 delas em um minuto com o motivo "sobrou" (R$ 394,85); em 16/10 foram 25 (R$ 2.171,78). Falta entender se isso
é rotina de sobra de cupom ou se esconde venda não recebida.

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
