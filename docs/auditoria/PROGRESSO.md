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
| 0 | Preparação e inventário | **concluída (30/10)**, esperando respostas do Rafael (seção 4 do relatório) | `00-inventario.md` |
| 1 | Desempenho e lentidão | não começou. Depende das respostas da Etapa 0 (ambiente e ferramentas) | `01-desempenho.md` |
| 2 | Saúde do código | não começou | `02-codigo.md` |
| 3 | Varredura de todas as telas | não começou | `03-telas.md` + `prints/` |
| 4 | Bugs de lógica e dados | não começou | `04-bugs.md` |
| 5 | Segurança e banco | não começou | `05-seguranca-banco.md` |
| 6 | Integrações e o que roda fora do navegador | não começou | `06-integracoes.md` |
| 7 | Interface, consistência e acessibilidade | não começou | `07-interface.md` |
| 8 | Relatório final e plano de correção | não começou | `RELATORIO-FINAL.md` |

## Onde parou

Etapa 0 terminada. Antes da Etapa 1, o Rafael precisa responder as perguntas da seção 4 do `00-inventario.md`:

1. Pode instalar `playwright-core` e `lighthouse` só dentro de `scripts/auditoria/`?
2. Ele cria os dois usuários de teste (dono e funcionário) e o colaborador e o entregador de teste?
3. As telas que gravam alguma coisa ao abrir entram ou ficam fora da medição?
4. Quer o projeto Supabase de teste para a Etapa 3?

## Scripts da auditoria (todos só leitura)

| Script | O que faz |
|---|---|
| `scripts/auditoria/db.mjs` | Conexão com o banco travada em só leitura (base dos outros) |
| `scripts/auditoria/mapa-rotas.mjs` | Lista as telas e as rotas de API, quem acessa e quantas consultas tem cada arquivo (`--json` pra máquina) |
| `scripts/auditoria/ferramentas-banco.mjs` | Versão, extensões, `pg_stat_statements`, tamanho e as maiores tabelas |
| `scripts/auditoria/pendencias-banco.mjs` | Policies `USING (true)` e funções SECURITY DEFINER abertas sem login |
| `scripts/auditoria/rpcs-que-gravam.mjs` | Quais funções do banco gravam alguma coisa (pra saber quais telas o robô não pode abrir) |

## Achados abertos (contagem por etapa)

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
