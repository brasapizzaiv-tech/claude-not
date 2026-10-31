# Etapa 1 — Desempenho e lentidão

**Concluída em 31/10/2026.**

## Resumo para o Rafael

- **A maioria das telas abre rápido.** Neste computador, clicar no menu e ter a tela pronta no servidor leva em média 0,3 s (90% das telas ficam abaixo de 0,52 s). O conteúdo principal aparece em média em 0,55 s.
- **O peso das telas não é o problema.** Nenhuma passa de 300 KB.
- **O banco é rápido.** A maioria das consultas leva menos de 20 ms.
- **O que está lento, com número:**
  1. **O cliente no celular, no /pedir.** A tela baixa as fotos do cardápio de uma vez, uns 6 MB. No 4G ela só termina em 23,5 s (no computador, 1,9 s). No Cardápio do painel, que mostra as mesmas fotos, a tela termina em 9,5 s.
  2. **Financeiro → Banco: 1,6 s por clique.** Carrega todo o histórico de lançamentos e de extrato.
  3. **Financeiro → Buffet: 1,2 s por clique**, e o conteúdo aparece em 2,8 s.
  4. **Notas fiscais do salão: 0,9 s.** Soma todas as notas já emitidas desde o começo.
  5. **Tela inicial:** 89 requisições e 5,2 s até terminar tudo (8,6 s na 1ª vez).
  6. **Contagem de estoque:** um cálculo leva em média 0,4 s no banco, e o pior caso foi 4,3 s.
- **Em toda tela do painel:** a conferência do login custa ~0,15 s por clique. Uma tela simples do painel leva 0,23 a 0,28 s, enquanto uma tela de fora do painel leva 0,09 a 0,12 s.

## Como foi medido

- **Telas:** `scripts/auditoria/medir-telas.mjs`.
  - Um robô com o Chrome instalado e o login do Rafael abriu **125 telas, 3 vezes cada** (a 1ª vez com o cache limpo), em 31/10 das 19:48 às 20:13. Foi em pleno serviço de sábado, com a carga real da casa.
  - As telas públicas também foram abertas num **celular simulado em 4G**: 1,6 Mbit/s, 150 ms de atraso e processador 4× mais lento.
  - O robô só abriu páginas. Tudo que não era GET foi cortado: só foram cortados o registro de visita da vitrine do /pedir e uma chamada do Google Maps.
  - Ficaram de fora 2 telas sem exemplo (`/delivery/campanhas/[id]`, `/salao/cardapio/combos/[id]`) e as de link pessoal (`/eu`, `/contar`, `/folga`, `/entrega/[token]`, `/cotar`), além da TV e de `/cotacoes/[id]/fornecedores`.
- **O que cada coluna quer dizer:**
  - **Pronta:** até a rede ficar quieta por meio segundo. Inclui fotos e as telas que o Next pré-carrega dos links visíveis.
  - **Clique no menu:** o pedido que o Next faz ao trocar de tela (RSC), ou seja, quanto o servidor leva pra montar a tela.
  - **Conteúdo principal:** o LCP, quando o maior bloco aparece.
  - Os tempos são a mediana da 2ª e da 3ª abertura; a "1ª vez" é a abertura com o cache limpo.
- **JavaScript:** `npx next build` + `scripts/auditoria/js-por-rota.mjs` (gzip).
- **Banco:** `scripts/auditoria/consultas-lentas.mjs --explain`, com o `pg_stat_statements` de 10/08 a 31/10 (82 dias). Planos por `EXPLAIN (GENERIC_PLAN)`, sem `ANALYZE`, como `authenticated`.
- **Situação:** "ok" = pronta em até 2 s; "atenção" = 2 a 4 s; "lenta" = mais de 4 s. Contagem: **77 ok, 42 atenção, 5 lentas, 1 sem medida.** A sem medida é o quiosque da balança, que fica chamando a balança deste PC (cortada pelo robô) e nunca fica quieto.

## 1. As telas mais lentas

| Tela | Pronta | 1ª vez | Clique no menu | Conteúdo principal | Requisições | Por quê |
|---|---:|---:|---:|---:|---:|---|
| `/pedir` (celular 4G) | **23,5 s** | 25,1 s | 0,7 s | 2,0 s | 60 | ~50 fotos do cardápio de uma vez (DES-006) |
| `/salao/cardapio` | **9,5 s** | 4,5 s | 0,3 s | 0,8 s | 87 | as mesmas fotos (DES-006) |
| `/colaboradores` | **5,3 s** | 2,7 s | 0,4 s | 1,6 s | 43 | conteúdo aparece em 1,6 s |
| `/dashboard` | **5,2 s** | 8,6 s | 0,5 s | 0,7 s | 89 | pré-carregamento dos links + 8 contagens (DES-009) |
| `/colaboradores/ponto/diario` | 4,3 s | 3,5 s | 0,4 s | 1,8 s | 33 | conteúdo aparece em 1,8 s |
| `/financeiro/buffet` | 4,3 s | 3,0 s | **1,2 s** | **2,8 s** | 27 | 8 semanas de comandas, sem índice (DES-007) |
| `/financeiro/banco` | 2,6 s | 3,6 s | **1,6 s** | 1,5 s | 26 | todo o histórico (DES-002) |
| `/salao/notas-fiscais` | 2,6 s | 3,9 s | **0,9 s** | 1,4 s | 28 | soma todas as notas já emitidas (DES-008) |
| `/financeiro/cmv` | 3,5 s | **15,7 s** | 0,8 s | 1,3 s | 27 | a 1ª vez foi um caso isolado; quente fica em 3,5 s |
| `/salao/caixa/fechamentos` | 2,3 s | 2,4 s | 0,7 s | 0,9 s | 33 | — |
| `/contagens/consumo` | 3,1 s | 2,1 s | 0,7 s | 1,2 s | 24 | — |

As telas do dia a dia da equipe (`/salao/caixa`, `/pdv`, `/garcom`, `/delivery/novo`, `/salao`) ficaram entre 2,0 e 2,8 s pronta e entre 0,4 e 0,6 s no clique do menu. No celular, as telas públicas leves (`/login`, `/entrega`, `/motelli`, `/pedir/acompanhar`) ficaram entre 2,8 e 4,2 s em 4G.

A tabela completa das 131 medidas está no fim deste arquivo.

## 2. Peso do JavaScript — sem problema

Nenhuma tela passa de 300 KB comprimidos. Toda tela baixa uma base de 132 KB. A maior é `/delivery`, com 230 KB. Os 60 KB extras de 7 telas (`/delivery`, `/cozinha`, `/tv`, `/cotar`, `/login`, `/etiquetas/scanner`, `/e/[id]`) são o cliente da Supabase no navegador, e isso é normal.

## 3. Banco

O banco tem 62 MB, e as maiores tabelas do dia a dia têm de 3 mil a 6 mil linhas. As consultas que pesam (medidas pelo Postgres em 82 dias):

| Consulta | De onde vem | Chamadas | Média | Pior |
|---|---|---:|---:|---:|
| Todos os lançamentos, com categoria e fornecedor | `/financeiro/banco` | 2.319 | 330 ms | 981 ms |
| `contagem_referencia` | contagem (painel) | 157 | 405 ms | 4.300 ms |
| `contar_referencia` | link `/contar` da equipe | 1.077 | 172 ms | 956 ms |
| Todas as transações do banco | `/financeiro/banco` | 1.202 | 133 ms | 593 ms |
| Comandas por dia (contagem) | tela inicial, 8× por abertura | 1.976 | 81 ms | 394 ms |
| `colaborador_pedidos` | app `/eu` da equipe | 3.059 | 78 ms | 1.084 ms |
| `dashboard_serie_6meses` | tela inicial | 330 | 85 ms | 278 ms |
| `painel_resumo` | tela inicial | 544 | 63 ms | 320 ms |
| Itens por nota (contagem) | cron `/api/sefaz/completar` | **392.007** | 1,3 ms | 306 ms |

**Consultas por tela** (chamadas `.from`/`.rpc` no arquivo da tela, sem contar as ~8 do layout e do middleware):

| Tela | Consultas |
|---|---:|
| `/dashboard` | 17 |
| `/garcom/mesa/[mesa]` | 15 |
| `/pedir` | 14 |
| `/delivery/vitrine` e `/salao/comandas/[id]` | 12 |
| `/colaboradores/semana`, `/delivery/novo`, `/eu/[token]`, `/garcom/comanda/[id]` | 11 |

## 4. Achados

### [DES-001] Cada tela do painel confere o login 3 vezes e faz ~8 consultas em fila antes do conteúdo
- Severidade: médio
- Onde: `src/lib/supabase/middleware.ts:31` e `:108`; `src/app/(painel)/layout.tsx:17`, `:30`, `:41`, `:55`, `:59` e `:70`; `src/lib/empresa.ts:53-65` e `:133-143`; `src/components/cores-da-empresa.tsx:11`
- O que acontece: a cada abertura de tela do painel:
  - **middleware:** `auth.getUser()`, que é uma ida ao servidor de login da Supabase, e mais o perfil;
  - **título da aba:** `getUser()` de novo, o perfil e a empresa;
  - **layout:** `getUser()` pela terceira vez, o perfil, a marca e duas contagens do menu, uma esperando a outra;
  - **cores:** a marca de novo;
  - e muitas telas ainda chamam `exigirAcesso` com mais um `getUser`.
- Como reproduzir: comparar o "clique no menu" de uma tela simples do painel com o de uma tela de fora dele.
- Evidência, medida pelo robô:
  - telas do painel com 1 consulta própria: `/aparencia` 0,23–0,28 s, `/formas-pagamento` 0,25 s;
  - telas de fora do painel: `/login` 0,09 s, `/motelli` 0,10 s, `/e/[id]` 0,12 s.

  A diferença, **~0,15 s, entra em todo clique**. É metade do tempo médio de servidor de uma tela (0,30 s).
- Causa provável: cada camada busca a sessão por conta própria, e o layout faz tudo em sequência.
- Correção proposta:
  1. Um único `sessao()` com `cache()` do React (usuário + perfil + empresa), usado pelo layout, pelo título, pelas cores e pelo `exigirAcesso`.
  2. `getClaims()` (confere o token sem ir à Supabase) no lugar de `getUser()` no middleware e no layout.
  3. As contagens do menu em `Promise.all`.
- Esforço: M
- Risco da correção: médio (é o login de todas as telas; testar entrar, sair, sessão vencida e permissão)
- Depende de: nada

### [DES-002] `/financeiro/banco` carrega todo o histórico a cada abertura — 1,6 s por clique
- Severidade: alto
- Onde: `src/app/(painel)/financeiro/banco/page.tsx:20-46`
- O que acontece: busca todas as transações do extrato (1.541) e todos os lançamentos (3.548, em 4 páginas de 1.000, com categoria e fornecedor), seja qual for o período que a pessoa quer ver.
- Como reproduzir: abrir `/financeiro/banco`.
- Evidência:
  - robô: clique no menu 1,6 s (2,3 s na 1ª vez), conteúdo em 1,5 s;
  - banco: 330 ms por página de lançamentos (pior: 981 ms) e 133 ms pelas transações.
- Causa provável: `buscarTodas` sem filtro de período. Cresce todo mês.
- Correção proposta: buscar só o período da tela (ou "não conciliados" + últimos 60 dias) e só os lançamentos candidatos a conciliar.
- Esforço: M
- Risco da correção: baixo
- Depende de: nada

### [DES-003] Faltam índices nas colunas que filtram de verdade
- Severidade: médio (hoje custa milissegundos; cresce com os dados e com a 2ª empresa)
- Onde: as policies `empresa_id = empresa_atual()` de todas as tabelas. Faltam índices em:
  - `pdv_comandas(aberta_em)`;
  - `nota_itens(nota_id)`;
  - `nota_itens(produto_id)`;
  - `pedido_itens(produto_id)`.
- O que acontece: com uma só empresa, o índice `*_empresa_idx` aponta pra todas as linhas. O banco usa esse índice e filtra o resto linha a linha:
  - contar as comandas de um dia percorre as 6.046 comandas (a tela inicial faz isso 8 vezes);
  - contar os itens de uma nota percorre os 3.149 itens.
- Como reproduzir: `node scripts/auditoria/consultas-lentas.mjs --explain`.
- Evidência: plano `Index Scan using pdv_comandas_empresa_idx … Filter: aberta_em >= $1 AND aberta_em < $2`. A média dessa contagem é 81 ms.
- Causa provável: os índices novos do multiempresa (migration 0175) foram só em `empresa_id`.
- Correção proposta: migration (com volta) criando `(empresa_id, aberta_em)`, `(empresa_id, nota_id)`, `nota_itens(produto_id)` e `pedido_itens(produto_id)`.
- Esforço: P
- Risco da correção: baixo
- Depende de: nada

### [DES-004] Contagem de estoque: `contagem_referencia` leva 405 ms em média (pior: 4,3 s); `contar_referencia` leva 172 ms
- Severidade: médio
- Onde: funções `_contagem_referencia` (chamada por `contagem_referencia`) e `contar_referencia`; telas `/contagens/[id]` e `/contar/[token]`.
- O que acontece: a referência da contagem é recalculada a cada abertura. No celular da equipe, com o link `/contar`, isso se soma ao 4G.
- Como reproduzir: abrir uma contagem.
- Evidência: `pg_stat_statements` (157 chamadas a 405 ms; 1.077 a 172 ms). No robô, `/contagens/[id]` levou 0,5 s no clique do menu.
- Causa provável: para **cada produto** da última contagem (~300), duas subconsultas somam as compras em `nota_itens` e `pedido_itens` por `produto_id`. **Nenhuma das duas tem índice nessa coluna**, então cada produto percorre as 3.149 + 1.318 linhas. Ainda soma `consumo_periodos` de 56 dias.
- Correção proposta: os índices do DES-003 e trocar as subconsultas por produto por um único `group by produto_id`.
- Esforço: P (índices) / M (reescrever)
- Risco da correção: baixo
- Depende de: DES-003

### [DES-005] Cron `/api/sefaz/completar` conta os itens nota por nota — 392 mil consultas em 82 dias
- Severidade: baixo
- Onde: `src/app/api/sefaz/completar/route.ts:52-58` e `:74-80`
- O que acontece: a cada 5 minutos, para cada nota manifestada nas últimas 3 h e nos últimos 5 dias, faz uma contagem separada. São ~4.800 consultas por dia sem ninguém usando o sistema.
- Como reproduzir: verificado por leitura e por `pg_stat_statements`; cron não disparado.
- Evidência: 392.007 chamadas, 516 s de banco no total.
- Causa provável: laço com uma consulta por nota (N+1).
- Correção proposta: uma consulta só (`notas_fiscais` com `nota_itens(count)`, ou uma RPC).
- Esforço: P
- Risco da correção: baixo
- Depende de: nada

### [DES-006] Fotos do cardápio em tamanho cheio e todas de uma vez: /pedir leva 23,5 s no celular em 4G
- Severidade: alto (é a tela do cliente)
- Onde: `src/app/pedir/vitrine-ui.tsx:23` (`<img src={url}>` sem `loading="lazy"`); também o Cardápio do painel (`/salao/cardapio`).
- O que acontece: a tela pede as ~50 fotos do cardápio ao abrir, inclusive as que estão fora da tela. Cada foto tem em média 126 KB (a maior 357 KB; 6,4 MB no total), mas aparece em 48 px (miniatura) ou em cartões de 80 a 144 px de altura.
- Como reproduzir: abrir `/pedir` num celular em 4G.
- Evidência, medida pelo robô:
  - `/pedir` em 4G: pronta em **23,5 s** (25,1 s na 1ª vez). Cada foto levou 18 a 21 s, porque todas disputam a mesma conexão. O conteúdo principal aparece em 2,0 s.
  - `/pedir` no computador: pronta em 1,9 s.
  - `/salao/cardapio`: pronta em **9,5 s**, com 87 requisições e fotos de 7,8 s.
  - storage `cardapio`: 51 arquivos, 6,4 MB.
- Causa provável: foto original, sem miniatura, e sem carregamento preguiçoso.
- Correção proposta:
  1. `loading="lazy"` e `decoding="async"` nas fotos. Esforço P, e só isso já tira as fotos fora da tela da conta.
  2. Uma miniatura (~400 px, ~20–30 KB) gerada no upload, usada na lista. A foto grande fica só no detalhe do item.
- Esforço: P (1) + M (2)
- Risco da correção: baixo
- Depende de: nada

### [DES-007] `/financeiro/buffet`: 1,2 s por clique e conteúdo em 2,8 s
- Severidade: médio
- Onde: `src/app/(painel)/financeiro/buffet/page.tsx:38-44`
- O que acontece: busca as comandas de buffet de 8 semanas (ou de 6 meses, conforme a escolha), em páginas de 1.000 ordenadas por `aberta_em`, e calcula tudo no servidor da Vercel.
- Como reproduzir: abrir `/financeiro/buffet`.
- Evidência: robô, clique no menu 1,2 s (1,9 s na 1ª vez) e conteúdo em 2,8 s, o pior LCP do painel.
- Causa provável: sem índice em `aberta_em` (DES-003), cada página percorre todas as comandas e ordena. O cálculo que poderia ser uma soma no banco vem linha a linha.
- Correção proposta: o índice do DES-003, e uma RPC que devolva já somado por dia (livre × quilo, peso, valor).
- Esforço: M
- Risco da correção: baixo
- Depende de: DES-003

### [DES-008] `/salao/notas-fiscais` soma todas as notas já emitidas a cada abertura — 0,9 s
- Severidade: médio
- Onde: `src/app/(painel)/salao/notas-fiscais/page.tsx:23-25`
- O que acontece: para mostrar o total, baixa o valor de **todas** as NFC-e autorizadas desde o começo (2.751 linhas hoje), em páginas de 1.000. Cresce a cada venda.
- Como reproduzir: abrir `/salao/notas-fiscais`.
- Evidência: robô, clique no menu 0,9 s e conteúdo em 1,4 s.
- Causa provável: soma feita no servidor da Vercel em vez de no banco.
- Correção proposta: `sum(valor)` no banco (RPC ou view), ou limitar ao período mostrado.
- Esforço: P
- Risco da correção: baixo
- Depende de: nada

### [DES-009] Tela inicial: 89 requisições e 5,2 s até terminar (8,6 s na 1ª vez)
- Severidade: médio
- Onde: `src/app/(painel)/dashboard/page.tsx:135-140` (as 8 contagens de comandas, uma por dia) e os links da tela, que o Next pré-carrega.
- O que acontece: o conteúdo aparece rápido, em 0,7 s. Depois, a tela continua puxando dados: as 8 contagens (81 ms cada no banco) e o pré-carregamento de cada link visível (mesas, atalhos), que no servidor vira uma montagem de tela por link.
- Como reproduzir: abrir `/dashboard` e olhar a aba Rede.
- Evidência: robô, 89 requisições, pronta 5,2 s (8,6 s na 1ª vez) e clique no menu 0,5 s.
- Causa provável: contagem dia a dia e `<Link>` com pré-carregamento padrão em muitos links.
- Correção proposta: uma consulta que conte os 8 dias de uma vez (com o índice do DES-003) e `prefetch={false}` nos links de mesa e atalhos que não precisam.
- Esforço: P
- Risco da correção: baixo
- Depende de: DES-003

## 5. As 5 correções rápidas de maior efeito

| # | Correção | Ganha | Esforço |
|---|---|---|---|
| 1 | Fotos do cardápio com carregamento preguiçoso (DES-006, parte 1) | /pedir no celular deixa de baixar ~6 MB de uma vez; /salao/cardapio idem | P |
| 2 | Migration com os 4 índices (DES-003) | contagem (0,4 s → menos), tela inicial, buffet, cron SEFAZ; e evita piorar com o tempo | P |
| 3 | Total das notas somado no banco (DES-008) | /salao/notas-fiscais: 0,9 s → próximo das telas comuns | P |
| 4 | /financeiro/banco só com o período (DES-002) | 1,6 s → próximo das telas comuns, e para de crescer | M |
| 5 | Sessão única com cache no painel (DES-001) | ~0,15 s a menos em **todo** clique do painel | M |

## 6. Observações pra outras etapas

- O bucket `cotacao-fotos` tem **356 MB** (91 fotos, média de 4 MB cada). São fotos da cotação sem compressão; custo de armazenamento e lentidão de quem abre. Vai pra Etapa 5 (crescimento).
- O comentário em `src/lib/tef-client.ts:106` diz que o Pix do dia a dia é o do Sicoob, mas o banco mostra o Pix do pinpad (Shipay) usado todo dia e nenhuma cobrança Sicoob desde 28/10. Vai pra Etapa 6.
- Os agentes gravam batimento com frequência: `impressao_config` com 143 mil updates e `balanca_status` com 109 mil inserts em 82 dias, mas a 1,5–2,3 ms cada. Não é problema hoje; Etapa 6.

## Anexo — todas as medidas

Mediana da 2ª e da 3ª abertura. "1ª vez" é com o cache limpo.

| Tela | Situação | Pronta | 1ª vez | Clique no menu | Conteúdo principal | Requisições |
|---|---|---:|---:|---:|---:|---:|
| `/salao/balanca/quiosque` | erro | — | — | 0,3 s | 0,6 s | 77 |
| `/pedir (celular 4G)` | lenta | 23,5 s | 25,1 s | 0,7 s | 2,0 s | 60 |
| `/salao/cardapio` | lenta | 9,5 s | 4,5 s | 0,3 s | 0,8 s | 87 |
| `/colaboradores` | lenta | 5,3 s | 2,7 s | 0,4 s | 1,6 s | 43 |
| `/dashboard` | lenta | 5,2 s | 8,6 s | 0,5 s | 0,7 s | 89 |
| `/colaboradores/ponto/diario` | lenta | 4,3 s | 3,5 s | 0,4 s | 1,8 s | 33 |
| `/financeiro/buffet` | lenta | 4,3 s | 3,0 s | 1,2 s | 2,8 s | 27 |
| `/login (celular 4G)` | atenção | 3,9 s | 3,9 s | 0,2 s | 2,2 s | 20 |
| `/salao/caixa/tef` | atenção | 3,8 s | 4,7 s | 0,5 s | 1,2 s | 30 |
| `/salao/caixa/movimentos` | atenção | 3,6 s | 4,0 s | 0,6 s | 1,0 s | 29 |
| `/financeiro/cmv` | atenção | 3,5 s | 15,7 s | 0,8 s | 1,3 s | 27 |
| `/notas` | atenção | 3,4 s | 4,4 s | 0,6 s | 0,9 s | 43 |
| `/notas/[id]` | atenção | 3,3 s | 3,9 s | 0,5 s | 1,1 s | 26 |
| `/delivery/novo` | atenção | 3,2 s | 2,0 s | 0,5 s | 0,6 s | 26 |
| `/contagens` | atenção | 3,2 s | 3,1 s | 0,3 s | 0,5 s | 47 |
| `/checklists/historico` | atenção | 3,2 s | 3,6 s | 0,3 s | 0,7 s | 30 |
| `/contagens/consumo` | atenção | 3,1 s | 2,1 s | 0,7 s | 1,2 s | 24 |
| `/conferencia` | atenção | 3,1 s | 3,1 s | 0,6 s | 1,1 s | 44 |
| `/checklists` | atenção | 3,1 s | 1,8 s | 0,2 s | 0,6 s | 30 |
| `/motelli (celular 4G)` | atenção | 3,0 s | 2,9 s | 0,2 s | 1,1 s | 22 |
| `/delivery/[id]` | atenção | 3,0 s | 1,9 s | 0,3 s | 0,7 s | 27 |
| `/pedir/acompanhar/[id] (celular 4G)` | atenção | 2,9 s | 3,2 s | 0,2 s | 1,2 s | 21 |
| `/motelli/privacidade (celular 4G)` | atenção | 2,9 s | 2,8 s | 0,2 s | 1,1 s | 22 |
| `/financeiro` | atenção | 2,8 s | 3,0 s | 0,3 s | 0,8 s | 42 |
| `/garcom` | atenção | 2,8 s | 4,0 s | 0,4 s | 0,4 s | 74 |
| `/entrega (celular 4G)` | atenção | 2,8 s | 3,5 s | 0,2 s | 2,1 s | 19 |
| `/salao` | atenção | 2,6 s | 2,7 s | 0,2 s | 0,5 s | 48 |
| `/cotacoes` | atenção | 2,6 s | 4,0 s | 0,3 s | 0,6 s | 45 |
| `/financeiro/banco` | atenção | 2,6 s | 3,6 s | 1,6 s | 1,5 s | 26 |
| `/salao/notas-fiscais` | atenção | 2,6 s | 3,9 s | 0,9 s | 1,4 s | 28 |
| `/salao/caixa/fiado` | atenção | 2,5 s | 2,2 s | 0,3 s | 0,6 s | 26 |
| `/delivery/campanhas/nova` | atenção | 2,5 s | 3,8 s | 0,5 s | 1,4 s | 26 |
| `/colaboradores/ponto/relatorios` | atenção | 2,5 s | 3,5 s | 0,4 s | 0,6 s | 34 |
| `/etiquetas/impressas` | atenção | 2,5 s | 3,8 s | 0,2 s | 0,5 s | 47 |
| `/salao/caixa` | atenção | 2,4 s | 4,7 s | 0,5 s | 0,8 s | 40 |
| `/cotacoes/[id]` | atenção | 2,4 s | 3,8 s | 0,5 s | 1,1 s | 32 |
| `/salao/caixa/fechamentos` | atenção | 2,3 s | 2,4 s | 0,7 s | 0,9 s | 33 |
| `/delivery/entregadores` | atenção | 2,3 s | 3,2 s | 0,3 s | 0,7 s | 30 |
| `/etiquetas/scanner` | atenção | 2,3 s | 5,3 s | 0,3 s | 0,6 s | 27 |
| `/delivery/config` | atenção | 2,2 s | 5,6 s | 0,3 s | 0,5 s | 31 |
| `/mural` | atenção | 2,2 s | 2,9 s | 0,3 s | 0,6 s | 37 |
| `/financeiro/caixa/[id]` | atenção | 2,2 s | 2,1 s | 0,4 s | 1,2 s | 23 |
| `/clientes` | atenção | 2,2 s | 2,4 s | 0,5 s | 1,3 s | 24 |
| `/financeiro/caixa` | atenção | 2,2 s | 1,9 s | 0,3 s | 0,4 s | 31 |
| `/colaboradores/ponto/horarios` | atenção | 2,2 s | 2,1 s | 0,3 s | 0,5 s | 36 |
| `/etiquetas` | atenção | 2,2 s | 3,5 s | 0,3 s | 0,7 s | 36 |
| `/delivery/campanhas` | atenção | 2,2 s | 4,7 s | 0,3 s | 0,6 s | 34 |
| `/salao/mesa/[mesa]` | atenção | 2,1 s | 4,8 s | 0,4 s | 0,5 s | 30 |
| `/salao/caixa/sangrias` | atenção | 2,1 s | 1,7 s | 0,4 s | 0,6 s | 26 |
| `/etiquetas/itens` | atenção | 2,1 s | 2,2 s | 0,3 s | 1,1 s | 26 |
| `/lembretes` | atenção | 2,1 s | 3,3 s | 0,5 s | 0,6 s | 24 |
| `/salao/caixa/cortesias` | atenção | 2,1 s | 3,9 s | 0,3 s | 0,7 s | 25 |
| `/pdv` | atenção | 2,0 s | 2,1 s | 0,4 s | 0,7 s | 26 |
| `/colaboradores/[id]` | atenção | 2,0 s | 3,6 s | 0,3 s | 0,5 s | 31 |
| `/cozinha/relatorio` | ok | 2,0 s | 3,4 s | 0,3 s | 0,6 s | 25 |
| `/colaboradores/ponto/regras` | ok | 2,0 s | 1,8 s | 0,3 s | 0,5 s | 26 |
| `/cozinha/recados` | ok | 2,0 s | 2,3 s | 0,3 s | 0,5 s | 26 |
| `/delivery/vitrine` | ok | 2,0 s | 3,1 s | 0,3 s | 0,5 s | 30 |
| `/notas/sefaz` | ok | 2,0 s | 2,1 s | 0,3 s | 0,6 s | 26 |
| `/colaboradores/ponto` | ok | 1,9 s | 2,6 s | 0,5 s | 0,7 s | 36 |
| `/fiscal/perfis` | ok | 1,9 s | 2,0 s | 0,2 s | 0,7 s | 26 |
| `/checklists/modelos` | ok | 1,9 s | 2,0 s | 0,4 s | 0,5 s | 26 |
| `/colaboradores/assiduidade` | ok | 1,9 s | 1,8 s | 0,5 s | 0,6 s | 28 |
| `/pedir` | ok | 1,9 s | 2,5 s | 0,5 s | 0,6 s | 61 |
| `/financeiro/categorias` | ok | 1,9 s | 3,9 s | 0,3 s | 0,7 s | 26 |
| `/colaboradores/ponto/espelhos` | ok | 1,9 s | 2,0 s | 0,3 s | 0,6 s | 27 |
| `/cotacoes/[id]/comparar` | ok | 1,9 s | 2,2 s | 0,5 s | 0,5 s | 26 |
| `/impressao` | ok | 1,9 s | 2,3 s | 0,4 s | 0,6 s | 24 |
| `/delivery/relatorios` | ok | 1,9 s | 4,4 s | 0,3 s | 0,5 s | 25 |
| `/cotacoes/[id]/pedidos` | ok | 1,9 s | 4,2 s | 0,3 s | 0,5 s | 26 |
| `/delivery/cupons` | ok | 1,9 s | 1,7 s | 0,3 s | 0,6 s | 26 |
| `/delivery/areas` | ok | 1,9 s | 3,5 s | 0,4 s | 0,8 s | 48 |
| `/produtos` | ok | 1,9 s | 2,2 s | 0,4 s | 0,8 s | 24 |
| `/colaboradores/semana` | ok | 1,8 s | 2,0 s | 0,4 s | 0,8 s | 29 |
| `/salao/notas-fiscais/avulsa` | ok | 1,8 s | 1,9 s | 0,3 s | 0,6 s | 26 |
| `/financeiro/vendidos` | ok | 1,8 s | 2,7 s | 0,4 s | 0,5 s | 31 |
| `/conferencia/novo` | ok | 1,8 s | 1,8 s | 0,3 s | 0,4 s | 26 |
| `/checklists/apontamentos` | ok | 1,8 s | 2,6 s | 0,3 s | 0,5 s | 26 |
| `/delivery/kern` | ok | 1,8 s | 3,7 s | 0,4 s | 0,5 s | 34 |
| `/financeiro/vendas` | ok | 1,8 s | 3,6 s | 0,4 s | 0,5 s | 26 |
| `/financeiro/dre` | ok | 1,8 s | 2,1 s | 0,3 s | 0,5 s | 29 |
| `/salao/caixa/vales` | ok | 1,7 s | 5,4 s | 0,3 s | 0,5 s | 27 |
| `/feriados` | ok | 1,7 s | 3,8 s | 0,3 s | 0,4 s | 26 |
| `/reservas/hoje` | ok | 1,7 s | 1,3 s | 0,3 s | 0,8 s | 21 |
| `/conferencia/[id]` | ok | 1,7 s | 2,6 s | 0,3 s | 0,5 s | 28 |
| `/delivery/whatsapp` | ok | 1,7 s | 1,9 s | 0,5 s | 0,7 s | 26 |
| `/etiquetas/[id]` | ok | 1,7 s | 2,0 s | 0,2 s | 0,6 s | 27 |
| `/delivery/gatilhos` | ok | 1,7 s | 1,7 s | 0,4 s | 0,6 s | 28 |
| `/garcom/mesa/[mesa]` | ok | 1,7 s | 1,6 s | 0,6 s | 0,9 s | 24 |
| `/delivery/entregadores/acerto` | ok | 1,7 s | 1,8 s | 0,3 s | 0,5 s | 28 |
| `/financeiro/orcamento` | ok | 1,7 s | 2,1 s | 0,4 s | 0,5 s | 29 |
| `/folgas` | ok | 1,7 s | 2,0 s | 0,3 s | 0,5 s | 24 |
| `/salao/cancelados` | ok | 1,7 s | 1,8 s | 0,3 s | 0,6 s | 25 |
| `/financeiro/caixa/novo` | ok | 1,7 s | 4,1 s | 0,3 s | 0,5 s | 26 |
| `/checklists/revisao` | ok | 1,7 s | 2,6 s | 0,3 s | 0,4 s | 26 |
| `/delivery` | ok | 1,7 s | 2,5 s | 0,3 s | 0,7 s | 28 |
| `/motelli` | ok | 1,7 s | 2,1 s | 0,1 s | 0,5 s | 21 |
| `/financeiro/contas` | ok | 1,7 s | 4,0 s | 0,3 s | 0,5 s | 29 |
| `/salao/balanca` | ok | 1,7 s | 3,1 s | 0,3 s | 0,5 s | 28 |
| `/contagens/[id]` | ok | 1,7 s | 3,3 s | 0,5 s | 0,8 s | 26 |
| `/salao/comandas/[id]` | ok | 1,7 s | 1,7 s | 0,4 s | 0,4 s | 27 |
| `/delivery/cashback` | ok | 1,6 s | 1,7 s | 0,2 s | 0,5 s | 26 |
| `/cozinha` | ok | 1,6 s | 3,9 s | 0,3 s | 0,5 s | 22 |
| `/financeiro/fatura` | ok | 1,6 s | 2,1 s | 0,3 s | 0,5 s | 26 |
| `/delivery/entregadores/caixa` | ok | 1,6 s | 2,1 s | 0,2 s | 0,4 s | 26 |
| `/reservas` | ok | 1,6 s | 3,0 s | 0,3 s | 0,5 s | 24 |
| `/garcom/comanda/[id]` | ok | 1,6 s | 3,0 s | 0,3 s | 0,5 s | 25 |
| `/contagens/agendamentos` | ok | 1,6 s | 1,8 s | 0,3 s | 0,5 s | 28 |
| `/salao/cardapio/adicionais/[itemId]` | ok | 1,6 s | 2,6 s | 0,3 s | 0,7 s | 23 |
| `/salao/caixa/movimentos/[id]` | ok | 1,6 s | 2,4 s | 0,3 s | 0,7 s | 23 |
| `/categorias` | ok | 1,6 s | 1,9 s | 0,3 s | 0,5 s | 33 |
| `/retiradas` | ok | 1,6 s | 1,9 s | 0,3 s | 0,5 s | 24 |
| `/fiscal` | ok | 1,6 s | 1,7 s | 0,3 s | 0,4 s | 26 |
| `/conferencia/divergencias` | ok | 1,6 s | 1,6 s | 0,3 s | 0,5 s | 28 |
| `/fornecedores` | ok | 1,5 s | 1,6 s | 0,3 s | 0,4 s | 24 |
| `/colaboradores/cadastros` | ok | 1,5 s | 1,7 s | 0,3 s | 0,4 s | 26 |
| `/colaboradores/ponto/horarios/[id]` | ok | 1,5 s | 2,0 s | 0,3 s | 0,4 s | 29 |
| `/solicitacoes` | ok | 1,5 s | 1,5 s | 0,3 s | 0,4 s | 24 |
| `/aparencia` | ok | 1,5 s | 1,6 s | 0,2 s | 0,4 s | 26 |
| `/contagens/[id]/atribuir` | ok | 1,4 s | 2,0 s | 0,3 s | 0,4 s | 26 |
| `/salao/caixa/pix` | ok | 1,4 s | 2,3 s | 0,3 s | 0,4 s | 28 |
| `/cardapio-do-dia` | ok | 1,4 s | 1,6 s | 0,4 s | 0,5 s | 25 |
| `/usuarios` | ok | 1,4 s | 1,8 s | 0,3 s | 0,4 s | 24 |
| `/formas-pagamento` | ok | 1,4 s | 1,7 s | 0,3 s | 0,4 s | 24 |
| `/cofre` | ok | 1,3 s | 1,6 s | 0,3 s | 0,4 s | 24 |
| `/e/[id]` | ok | 1,1 s | 1,6 s | 0,1 s | 0,3 s | 21 |
| `/login` | ok | 1,1 s | 1,2 s | 0,1 s | 0,3 s | 21 |
| `/sistema` | ok | 1,0 s | 1,4 s | 0,1 s | 0,2 s | 19 |
| `/entrega` | ok | 1,0 s | 1,4 s | 0,2 s | 0,4 s | 20 |
| `/motelli/privacidade` | ok | 1,0 s | 1,4 s | 0,1 s | 0,3 s | 21 |
| `/pedir/acompanhar/[id]` | ok | 1,0 s | 1,2 s | 0,2 s | 0,3 s | 22 |
