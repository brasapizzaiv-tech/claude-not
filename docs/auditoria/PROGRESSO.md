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

Etapa 1: 9 achados (DES-001 a DES-009) — 2 altos (DES-002 /financeiro/banco, DES-006 fotos do /pedir), 6 médios, 1 baixo. Detalhes no `01-desempenho.md`.

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
