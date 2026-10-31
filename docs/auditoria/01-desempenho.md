# Etapa 1 — Desempenho e lentidão

**Situação: em andamento (31/10/2026).** Prontas a medição do JavaScript por tela, a do banco e a leitura do código. Falta a medição das telas com o robô, que precisa do login do Rafael e roda fora do serviço. Os achados abaixo são provisórios até ela entrar.

Como foi medido:
- **JavaScript:** `npx next build` + `node scripts/auditoria/js-por-rota.mjs` (soma os pedaços que cada tela baixa na 1ª visita, comprimidos com gzip).
- **Banco:** `node scripts/auditoria/consultas-lentas.mjs --explain`. Estatísticas do próprio Postgres (`pg_stat_statements`) desde 10/08/2026, ou seja, 82 dias de uso real. Plano de execução por `EXPLAIN (GENERIC_PLAN)`, sem `ANALYZE`, como o papel `authenticated` (com RLS).
- **Telas:** `scripts/auditoria/medir-telas.mjs`, ainda não rodado.

## 1. Peso do JavaScript por tela — sem problema

Nenhuma tela passa de 300 KB comprimidos. Toda tela baixa uma base de 132 KB (Next, React, layout). As mais pesadas:

| Tela | 1ª visita (gzip) | só desta tela |
|---|---:|---:|
| `/delivery` | 230 KB | 98 KB |
| `/cozinha` | 223 KB | 91 KB |
| `/etiquetas/scanner` | 222 KB | 90 KB |
| `/tv` | 219 KB | 87 KB |
| `/cotar/[token]` | 218 KB | 86 KB |
| `/salao/caixa` | 193 KB | 60 KB |

Os 60 KB extras dessas telas são o cliente da Supabase no navegador (login e Realtime), usado por 7 telas. Isso é normal e não explica lentidão. Tabela completa: `node scripts/auditoria/js-por-rota.mjs`.

## 2. Banco — rápido no geral, com exceções

O banco é pequeno: 62 MB, e as maiores tabelas do dia a dia têm de 3 mil a 6 mil linhas. A maioria das consultas das telas leva menos de 20 ms. As exceções, medidas pelo próprio Postgres:

| Consulta | De onde vem | Chamadas | Média | Pior |
|---|---|---:|---:|---:|
| Todos os lançamentos, com categoria e fornecedor | `/financeiro/banco` | 2.319 | 330 ms | 981 ms |
| `contagem_referencia` | contagem (painel) | 157 | 405 ms | 4.300 ms |
| `contar_referencia` | link `/contar` da equipe | 1.077 | 172 ms | 956 ms |
| Todas as transações do banco | `/financeiro/banco` | 1.202 | 133 ms | 593 ms |
| Comandas por dia (contagem) | tela inicial, 8 vezes por abertura | 1.976 | 81 ms | 394 ms |
| `colaborador_pedidos` | app `/eu` da equipe | 3.059 | 78 ms | 1.084 ms |
| `dashboard_serie_6meses` | tela inicial | 330 | 85 ms | 278 ms |
| `painel_resumo` | tela inicial | 544 | 63 ms | 320 ms |
| Itens por nota (contagem) | cron `/api/sefaz/completar` | **392.007** | 1,3 ms | 306 ms |

## 3. Achados (provisórios até a medição das telas)

### [DES-001] Cada tela do painel confere o login 3 vezes e faz ~8 consultas em fila antes do conteúdo
- Severidade: alto (provisório; o número sai do robô)
- Onde: `src/lib/supabase/middleware.ts:31` e `:108`; `src/app/(painel)/layout.tsx:17`, `:30`, `:41`, `:55`, `:59` e `:70`; `src/lib/empresa.ts:53-65` e `:133-143`; `src/components/cores-da-empresa.tsx:11`
- O que acontece: antes de a tela começar a buscar os próprios dados, uma abertura de qualquer tela do painel faz:
  - **middleware:** `auth.getUser()`, que é uma ida ao servidor de login da Supabase, e mais o perfil;
  - **título da aba** (`generateMetadata` → `empresaAtual`): `getUser()` de novo, o perfil e a empresa;
  - **layout:** `getUser()` pela terceira vez, o perfil de novo, a marca (empresa), a contagem de reservas e a contagem de pedidos de compra, **uma esperando a outra**;
  - **cores da empresa:** a marca de novo;
  - e muitas telas ainda chamam `exigirAcesso` ou `getUser` dentro da própria página.
- Como reproduzir: abrir qualquer tela do painel; o tempo vai aparecer na coluna "Servidor (TTFB)" do robô.
- Evidência: leitura do código, com as linhas acima. Medida pendente.
- Causa provável: cada camada busca a sessão por conta própria, e o layout faz tudo em sequência.
- Correção proposta:
  1. Um único `sessao()` com `cache()` do React (usuário + perfil + empresa), usado pelo layout, pelo título, pelas cores e pelo `exigirAcesso`.
  2. No middleware e no layout, `getClaims()` (confere o token no próprio servidor, sem ir à Supabase) no lugar de `getUser()`.
  3. As contagens do menu num `Promise.all`.
- Esforço: M
- Risco da correção: médio (é o login de todas as telas; testar entrar, sair, sessão vencida e permissão)
- Depende de: nada

### [DES-002] `/financeiro/banco` carrega todo o histórico de lançamentos e de extrato a cada abertura
- Severidade: alto
- Onde: `src/app/(painel)/financeiro/banco/page.tsx:20-46`
- O que acontece: a tela busca todas as transações do extrato (1.541) e todos os lançamentos (3.548, em 4 páginas de 1.000, com categoria e fornecedor), seja qual for o período que a pessoa quer ver. Cada página de lançamentos leva 330 ms em média no banco, e o pior caso foi 981 ms. Cresce todo mês.
- Como reproduzir: abrir `/financeiro/banco`.
- Evidência: `pg_stat_statements`, 2.319 chamadas, média 330 ms. Plano: varre `lancamentos` inteiro pelo índice de data.
- Causa provável: `buscarTodas` sem filtro de período.
- Correção proposta: buscar só o período da tela (mês, ou "não conciliados" + últimos 60 dias) e os lançamentos candidatos a conciliar, não todos.
- Esforço: M
- Risco da correção: baixo
- Depende de: nada

### [DES-003] A regra de "uma empresa por vez" faz o banco ler a tabela toda em várias consultas, e faltam dois índices
- Severidade: médio (hoje custa milissegundos; cresce com os dados e com a 2ª empresa)
- Onde: as policies `empresa_id = empresa_atual()` de todas as tabelas; faltam os índices `nota_itens(nota_id)` e `pdv_comandas(aberta_em)`.
- O que acontece: com uma só empresa, o índice `*_empresa_idx` aponta pra todas as linhas. O planejador usa esse índice e filtra o resto linha a linha. Exemplos:
  - contar os itens de uma nota percorre os 3.149 itens;
  - contar as comandas de um dia percorre as 6.046 comandas. A tela inicial faz isso 8 vezes por abertura, com média de 81 ms cada.
- Como reproduzir: `node scripts/auditoria/consultas-lentas.mjs --explain`, nos planos de `nota_itens` e `pdv_comandas`.
- Evidência: plano `Index Scan using pdv_comandas_empresa_idx … Filter: aberta_em >= $1 AND aberta_em < $2`.
- Causa provável: índices só em `empresa_id`, sem a coluna que filtra de verdade.
- Correção proposta: migration com índices compostos (`empresa_id, aberta_em`), (`empresa_id, nota_id`) e os outros que o robô apontar. Na tela inicial, uma consulta (ou RPC) que conta os 8 dias de uma vez.
- Esforço: P (índices) + P (tela inicial)
- Risco da correção: baixo
- Depende de: nada

### [DES-004] Contagem de estoque: `contagem_referencia` leva 405 ms em média (pior: 4,3 s) e `contar_referencia` 172 ms
- Severidade: médio
- Onde: funções `_contagem_referencia` (chamada por `contagem_referencia`) e `contar_referencia` no banco; telas `/contagens/[id]` e o link `/contar/[token]`.
- O que acontece: a referência da contagem (consumo, última contagem) é calculada a cada abertura. No celular da equipe, com o link `/contar`, isso soma ao 4G.
- Como reproduzir: abrir uma contagem.
- Evidência: `pg_stat_statements` (157 chamadas a 405 ms; 1.077 a 172 ms).
- Causa provável: a ler a função na Etapa 5 (segurança e banco). O corpo tem 2.541 caracteres.
- Correção proposta: definir depois de ler a função. Provável índice ou cálculo guardado.
- Esforço: M
- Risco da correção: baixo
- Depende de: leitura da função

### [DES-005] Cron `/api/sefaz/completar` conta os itens nota por nota (392 mil consultas em 82 dias)
- Severidade: baixo
- Onde: `src/app/api/sefaz/completar/route.ts:52-58` e `:74-80`
- O que acontece: a cada 5 minutos, para cada nota das últimas 3 horas e dos últimos 5 dias, faz uma contagem separada. Isso dá cerca de 4.800 consultas por dia, sem ninguém usando o sistema.
- Como reproduzir: verificado por leitura e por `pg_stat_statements`; cron não disparado.
- Evidência: 392.007 chamadas, 516 s de banco no total.
- Causa provável: laço com uma consulta por nota (N+1).
- Correção proposta: uma consulta só (`notas_fiscais` com `nota_itens(count)`, ou RPC).
- Esforço: P
- Risco da correção: baixo
- Depende de: nada

## 4. Falta

- [ ] Rodar o robô nas ~140 telas (3 vezes cada) e nas públicas em celular 4G, fora do serviço e com o login do Rafael.
- [ ] Preencher a tabela ok/atenção/lenta e confirmar ou derrubar o DES-001 com número.
- [ ] Consultas por tela (quantas idas ao banco cada uma faz) e telas que buscam no navegador depois de abrir.
- [ ] As 5 correções rápidas de maior efeito.
