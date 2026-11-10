# Etapa 2 — Saúde do código

Feita em 08/11/2026 (domingo, fora do serviço), com a versão `877868c` no ar. Só leitura: nada do sistema foi
alterado, nenhuma nota emitida, banco só lido (`scripts/auditoria/db.mjs`).

Scripts novos desta etapa (só leitura):
- `scripts/auditoria/codigo-morto.mjs`: arquivos e exports de `src` que ninguém importa.
- `scripts/auditoria/migrations-x-banco.mjs`: arquivos de migration × `public._migrations`, números repetidos, e
  tabelas, colunas e funções do banco que nenhuma migration cria.

## Resumo

| # | Item pedido | Resultado |
|---|---|---|
| 1 | `tsc --noEmit` | **0 erros** |
| 2 | Lint | 0 erros e 22 avisos no código do sistema; 755 itens no total porque o lint lê cópias e bibliotecas (COD-007) |
| 3 | `next build` | Passa. 1 aviso: `middleware` virou `proxy` no Next 16 (COD-009) |
| 4 | Testes | 17 arquivos, 142 testes: **140 passam, 2 falham** (teste desatualizado, COD-008). Não há `npm test` nem nada que rode os testes sozinho |
| 5 | Dependências | 18 avisos do `npm audit` (1 crítico: `next`). Todas as bibliotecas são usadas; 1 usada sem estar declarada (COD-001, COD-010) |
| 6 | Código morto | 3 componentes que nada importa, 11 exports soltos em `src/lib`, 4 rotas de sobra (COD-011) |
| 7 | Regra duplicada | **A nota fiscal declara "Dinheiro" em quase toda venda do caixa** (COD-002); fila da nota automática decidida de dois jeitos (COD-003); saldo do fiado calculado em 5 lugares (COD-006) |
| 8 | `any`, `@ts-ignore`, `catch` vazio | 15 `any` (WebSerial e cliente do Supabase), 0 `@ts-ignore`, 30 `catch` vazios, todos inofensivos; nenhuma gravação no banco sem `await` |
| 9 | `console.log` e dado sensível em log | 0 `console.log`, nenhum segredo em log. O contrário é que preocupa: só 2 `console.error` no `src` inteiro (COD-004) |
| 10 | Variáveis de ambiente | Nenhum segredo exposto ao navegador. Umas 25 variáveis usadas e só 2 documentadas, sem `.env.example` (COD-005) |
| 11 | Migrations × banco | 278 arquivos, todos aplicados. Nenhuma tabela, coluna ou função feita direto no banco. 1 registro órfão e 4 números repetidos (COD-012) |

**O mais importante:** COD-002. As NFC-e do caixa saem com a forma de pagamento errada. É problema fiscal e
precisa de decisão do Rafael antes da Etapa 3.

> **COD-002 CORRIGIDO em 08/11/2026 ~19h** (commit 7499bf8, com o OK do Rafael): a nota usa os pagamentos da venda
> (`src/lib/fiscal/pagamentos-nota.ts`), com o grupo do cartão quando veio do pinpad. NFC-e de homologação autorizada
> antes de publicar. Falta conferir a 1ª nota real do caixa no cartão; as notas antigas são conversa com o contador.

## Achados

### [COD-002] As NFC-e do caixa saem com pagamento "Dinheiro", mesmo pagas no cartão, Pix ou vale
- Severidade: **crítico (fiscal)**
- Onde: `fecharSeQuitou` em `src/app/(painel)/salao/actions.ts` (linha ~995) grava `forma_pagamento: "Dividido"` em
  toda comanda que o caixa fecha. `emitirNfceCore` em `src/app/(painel)/salao/fiscal-actions.ts` usa a forma da comanda
  (`codigoFiscalDaForma`): "Dividido" não está no cadastro nem no mapa `FORMA_FOCUS`, então cai no padrão `"01"`
  (dinheiro). O comentário do código já diz isso ("nome desconhecido (ex.: "Dividido") vai como dinheiro").
- O que acontece: a nota é montada com um pagamento só, `forma_pagamento: "01"`, no valor total.
- Como reproduzir: verificado por leitura do código e do banco, não executado (seria nota real).
- Evidência (30 dias até 08/11, NFC-e autorizadas em produção, sem as avulsas): 1.244 notas do caixa, R$ 117.406,97,
  todas com a comanda em "Dividido". Pelos pagamentos gravados no caixa, foram: crédito 613 (R$ 57.178,73), débito 335
  (R$ 32.834,01), Pix na máquina 139 (R$ 14.175,73), vale refeição 110 (R$ 6.204,52), Pix 8 (R$ 1.019,36), dinheiro 16
  (R$ 2.032,47) e 16 com duas formas. Ou seja, umas 1.228 notas declaram dinheiro sem ter sido dinheiro. O PDV e o
  delivery gravam a forma real e não têm esse erro.
- Pra confirmar sem código: abrir o DANFE de qualquer nota do caixa paga no cartão e ver a forma de pagamento.
- Efeito: a nota diz uma coisa e a operadora do cartão informa outra à Receita. Pagamento em cartão na NFC-e
  normalmente leva também o grupo do cartão (tipo de integração, credenciadora, bandeira, autorização), que hoje não
  vai; confirmar com a Focus quais campos ela exige.
- Correção proposta: a nota usa os pagamentos de verdade da venda (`pdv_caixa_mov` da comanda, que já tem forma,
  bandeira e NSU), um `formas_pagamento` por pagamento, com o grupo do cartão quando veio do pinpad. A fila
  (`nfce_pendentes.formas`) já guarda as formas. Notas antigas não se corrigem (não dá pra mudar nota autorizada); a
  conversa com o contador decide se precisa fazer algo sobre elas.
- Esforço: M
- Risco da correção: médio (mexe na montagem de toda nota do caixa; testar em homologação antes)
- Depende de: decisão do Rafael (e, se ele quiser, do contador sobre as notas já emitidas).
- **Corrigido em 08/11 (OK do Rafael; commit `7499bf8`):** `src/lib/fiscal/pagamentos-nota.ts` monta uma linha por forma
  a partir de `pdv_caixa_mov` (estorno abate, repartido até o total da nota); cartão e Pix com `tipo_integracao` 2,
  bandeira e autorização do pinpad. Simulação nas 400 últimas notas: 394 passam à forma real, soma sempre igual ao
  total. NFC-e de homologação autorizada (crédito Mastercard + Pix + item com desconto). Falta a 1ª nota real do caixa.

### [COD-001] `next` 16.3.0 tem dois avisos críticos de segurança, e outras 4 bibliotecas diretas têm avisos altos
- **Corrigido em 10/11/2026 (Onda 3, lote 3).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: alto
- Onde: `package.json`
- O que o `npm audit` diz (8/11): 18 avisos (1 crítico, 9 altos, 8 moderados).
  - `next` 16.3.0, **crítico**: execução remota de código sem login em servidor Windows, e no otimizador de imagem
    com AVIF. Corrigido na 16.4.5. No nosso caso: produção roda na Vercel (Linux) e o `next.config.ts` não liga
    `images`/AVIF, então os dois provavelmente não se aplicam. O `next dev` roda neste notebook Windows, só em localhost.
  - `undici` (direta, alto): negação de serviço. `node-forge` (direta, alto): falhas na verificação de assinatura RSA;
    o sistema só usa pra abrir o certificado (`src/lib/sefaz/distribuicao.ts`), não pra verificar assinatura.
  - `xlsx` 0.18.5 (direta, alto, **sem correção no npm**): poluição de protótipo e ReDoS ao ler planilha. Lê planilha
    enviada em `financeiro/vendas/actions.ts`, só por quem tem Financeiro. A SheetJS publica as versões corrigidas
    no site dela, não no npm.
  - O resto é transitivo (`sharp` do next, `zod`, `brace-expansion`, `js-yaml`, `source-map-js`, `@xmldom/xmldom`,
    `minimatch` e o `typescript-eslint` do lint), quase todo com correção ao atualizar.
- Desatualizadas sem aviso: `@supabase/supabase-js` 2.112 → 2.119, `lucide-react` 1.47 → 1.70, `react` 19.2.8 → 19.3.1,
  `typescript` 5.9 → 7.0 e `eslint` 9 → 10 (essas duas são versões grandes, não mexer junto).
- Correção proposta: subir `next` e `eslint-config-next` pra 16.4.5 e `undici`, `node-forge`, `pdfkit`, `pg` no menor
  passo; build + roteiro curto de telas; publicar fora do serviço. `xlsx` à parte.
- Esforço: P (sem as versões grandes)
- Risco da correção: médio (Next muda de versão; rodar build e a Etapa 3 depois)

### [COD-003] Quem entra na fila da nota automática é decidido de dois jeitos
- Severidade: médio
- Onde: a tela usa `emiteNotaAuto(tipo)` (`src/lib/formas-pagamento.ts`, pelo **tipo** do cadastro) pra avisar "vai sair
  nota"; o servidor (`pagarSelecao`, `salao/actions.ts` ~1471) põe na fila pelo **nome**, com a expressão
  `/pix|cart|créd|cred|déb|deb|vale/i`.
- O que acontece: uma forma de cartão com outro nome (ex.: "Maquininha", tipo crédito) aparece na tela como nota
  automática e nunca entra na fila. O contrário também: um nome com "vale" que não é vale refeição.
- Evidência: leitura do código. Com as formas de hoje as duas regras dão o mesmo resultado.
- Correção proposta: o servidor usar `emiteNotaAuto(tipoDe(...))`, a mesma da tela.
- Esforço: P · Risco: baixo

### [COD-004] Erro no servidor quase nunca deixa rastro
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: médio
- Onde: todo o `src`: 2 `console.error` no total (`cotar/[token]/actions.ts` e o middleware); 37 blocos `catch` em ações e
  rotas. Vários engolem de propósito ("Nota é acessório: se a fila falhar, o recebimento continua valendo").
- O que acontece: quando algo falha em produção (fila da nota, impressão, WhatsApp), não sobra nada no log da Vercel
  nem no banco pra saber o quê, quando e com quem. A investigação depende de achar o efeito depois.
- Correção proposta: um `registrarErro(onde, erro, contexto)` que grava numa tabela (`erros_sistema`) e no
  `console.error`, chamado nos `catch` que engolem de propósito. Sem dado pessoal no contexto.
- Esforço: P · Risco: baixo

### [COD-005] Variáveis de ambiente quase todas sem documentação
- Severidade: médio (quem montar outro restaurante, ou outro PC, não sabe o que configurar)
- Onde: o código lê umas 25: `WHATSAPP_TOKEN/PHONE_ID/WABA_ID/APP_SECRET/VERIFY_TOKEN`, `PIX_BANCO` e as
  `PIX_<BANCO>_*` (montadas pelo nome em `src/lib/pix.ts`), `CRON_SECRET` (7 rotas), `FIREBASE_SERVICE_ACCOUNT_B64`,
  `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_BROWSER_KEY`, `RODIZIO_TV_CHAVE`, `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_WPP_CONFIG_ID`, `MARCA_*_DEV`, `SUPABASE_SERVICE_ROLE_KEY`,
  `DATABASE_URL`. O README documenta só as duas últimas. Não existe `.env.example`.
- O que está certo: nada secreto vai pro navegador. As três `NEXT_PUBLIC_` são identificadores públicos; a
  `GOOGLE_MAPS_BROWSER_KEY` vai pro navegador de propósito (é a chave do mapa, presa ao domínio no Google). A URL e a
  chave anon do Supabase estão em `src/lib/supabase/config.ts`, que é público por natureza.
- Correção proposta: `.env.example` com todas, sem valor, uma linha dizendo pra que serve e se é obrigatória.
- Esforço: P · Risco: nenhum

### [COD-006] O saldo do fiado é calculado em 5 lugares, e um deles vai cortar em 1000 linhas
- Severidade: baixo hoje
- Onde: `salao/caixa/fiado/page.tsx`, `buscarClientesCaixa` (`salao/actions.ts`), `src/lib/pagamento-especial.ts` (2×,
  limite de crédito) e `saldoDe` da nota avulsa. Todos somam `debito − pagamento` de `cliente_fiado`.
- O que acontece: a tela do Fiado pede `limit(3000)`, mas o Supabase devolve no máximo 1000 linhas; quando passar
  disso, as linhas mais antigas somem e os saldos ficam errados. As outras buscam por cliente, sem limite.
- Evidência: 151 linhas de 09/09 a 08/11 (~75 por mês; o Kern sozinho ~53). No ritmo de hoje, 1000 linhas lá por
  setembro de 2027.
- Correção proposta: uma função no banco (`saldo_fiado(cliente)` e uma visão com o saldo de todos), usada pelos 5.
- Esforço: P · Risco: baixo

### [COD-007] O lint lê o que não é do sistema
- Severidade: baixo
- Onde: `eslint.config.mjs` ignora só `.next`, `out` e `build`.
- O que acontece: `npx eslint .` dá 312 erros e 443 avisos; quase tudo vem de `.claude/worktrees/` (2 cópias antigas
  do projeto, 18 MB, ainda registradas no `git worktree list`), de `public/app/capacitor-native-bridge.js`, dos
  `jsQR.js` dos apps e de `installer-*/build`. No código do sistema: 0 erros e 22 avisos, dos quais só 5 são nossos:
  variáveis sem uso (`reps` em `financeiro/cmv/page.tsx`, `nomeCat` em `fornecedores/client.tsx`, `DOTS` em
  `agente-balanca/escpos.mjs`) e 2 `<img>` em `delivery/campanhas/seletor-modelo.tsx`.
- Correção proposta: ignorar essas pastas no lint; apagar as duas worktrees antigas (com o OK do Rafael).
- Esforço: P · Risco: nenhum

### [COD-008] Dois testes do delivery estão desatualizados
- Severidade: baixo
- Onde: `scripts/delivery-horarios.test.mjs` ("quarta 19:00 → noite livre" e "slots: quarta 16:00").
- O que acontece: o commit `5e7146e` passou a noite do delivery a só sexta e sábado. O código está certo; os testes
  ainda esperam quarta.
- Também: não existe `npm test`, então ninguém roda os testes sem saber os nomes. Os 17 arquivos cobrem contas puras
  (cofre, desconto, ponto, juntar comandas, etc.).
- Fluxos que mais precisam de teste: `pagarSelecao` (serviço, desconto, partes, várias comandas), a montagem da NFC-e
  (`emitirNfceCore`, que teria pegado o COD-002), o Fechamento Z, a guarda do TEF e o faturamento por dia.
- Correção proposta: acertar os 2 testes; `"test": "node --test scripts/*.test.mjs"`; separar a montagem da nota numa
  função pura testável.
- Esforço: P · Risco: nenhum

### [COD-009] `middleware.ts` com o nome antigo
- Severidade: baixo
- Onde: `src/middleware.ts`. O build avisa: "The "middleware" file convention is deprecated. Please use "proxy"".
- Correção proposta: renomear pra `proxy.ts` (a Next tem o codemod `middleware-to-proxy`). Testar login e as rotas
  públicas depois.
- Esforço: P · Risco: baixo

### [COD-010] `@zxing/library` é usada mas não está no `package.json`
- Severidade: baixo
- Onde: `src/components/leitor-qr.tsx` e `src/app/eu/[token]/baixa/scanner.tsx` importam `@zxing/library`. Ela só existe
  porque vem junto com `@zxing/browser`. Se a `@zxing/browser` mudar, o leitor de QR/código de barras quebra.
- Correção proposta: declarar `@zxing/library` no `package.json`.
- Esforço: P · Risco: nenhum

### [COD-011] Código e rotas que sobraram
- Severidade: baixo
- Componentes que nada importa: `salao/caixa/dividir-conta.tsx`, `salao/comandas/[id]/emitir-nfce.tsx`,
  `salao/comandas/[id]/print.tsx`.
- Exports de `src/lib` sem uso: `agenteAutorizado` (`impressao-agente.ts`, trocado por `empresaDoAgente` em todas as
  rotas), `tipoTefDaForma` (`tef-client.ts`, a regra antiga por nome; a de hoje é `tefDoTipo`), `consultarNfce` e
  `baixarDanfe` (`fiscal/focus.ts`), `daTroco`, `rotuloAgendado`, `proximos`, `stEmbutida`, `BRASA`, `TvPagina`, e 7
  tipos velhos em `src/lib/types.ts`.
- Rotas: `/api/tv/camera` (câmera da TV desligada em 21/10); `/api/rastreio` (formato Traccar; o rastreio passou pro app
  nativo, mas a tela `delivery/entregadores` ainda ensina a usar); `/sistema`; `/balanca-teste`, que é **pública** no
  middleware (vai pra Etapa 5).
- Correção proposta: apagar os 3 componentes e os exports; decidir com o Rafael as rotas.
- Esforço: P · Risco: baixo

### [COD-012] Migrations: um registro órfão e quatro números repetidos
- Severidade: baixo
- O banco tem `0216_tv_camera.sql` em `public._migrations`, mas o arquivo foi renomeado pra `0217_tv_camera.sql`
  (commit `8f5a77d`) depois de já aplicado. A 0217 também está registrada, então o mesmo SQL rodou duas vezes (era
  idempotente).
- 0081, 0082, 0083 e 0084 têm dois arquivos cada; os 8 estão aplicados. O risco é só de ordem num banco novo
  (a ordem é a do nome do arquivo).
- O que está certo: todos os 278 arquivos estão aplicados; nenhuma tabela, coluna ou função do banco (159 tabelas, 70
  funções) existe sem migration. As 3 tabelas que o script apontou (`cargos`, `departamentos`, `motivos_demissao`) são
  criadas num laço dentro da 0257.
- Correção proposta: apagar o registro órfão da 0216 e anotar no README que número repetido não é erro.
- Esforço: P · Risco: nenhum

## Observações que não viraram achado

- `catch` vazio: os 30 são leitura de JSON que pode vir vazio, `window.print()` e câmera. Nenhum esconde gravação.
- `any`: 15, todos com motivo escrito (WebSerial sem tipo no TS e o cliente genérico do Supabase).
- `eslint-disable`: 50, quase todos `no-img-element` (imagem do banco ou gerada no navegador) e `exhaustive-deps`.
- Testes avisam `MODULE_TYPELESS_PACKAGE_JSON` (os `.ts` são lidos como módulo); só deixa o teste mais lento.
- Para a Etapa 4: o mesmo "Dividido" do COD-002 aparece em relatórios que olham `pdv_comandas.forma_pagamento`; quem
  quiser a forma real tem que ler `pdv_caixa_mov`.
