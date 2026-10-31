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

Nenhum achado formal ainda. A Etapa 0 só registra observações, que viram itens nas etapas certas.
