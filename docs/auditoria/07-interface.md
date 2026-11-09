# Etapa 7 — Interface, consistência e acessibilidade

Feita em 09/11/2026 (segunda de manhã, antes do almoço), com a versão `581e343` no ar. Três frentes:

1. **Robô** (`scripts/auditoria/acessibilidade.mjs`): o axe-core (o mesmo motor do Lighthouse) em 126 telas, no
   computador/tema claro e no celular/tema escuro (252 medições), mais um teste de teclado (30 Tabs por tela). Mesmas
   travas da Etapa 3: só GET, toda gravação cortada no navegador; nada foi salvo. Rodou das 09:11 às 09:24. Não guarda o
   HTML das telas (podia ter nome de cliente), só a regra e o seletor.
2. **Consistência visual no código** (tokens, raios, botões, peças prontas, tema escuro), contada por regex sobre 602
   arquivos de `src/` mais o site e o app das marmitas.
3. **Acessibilidade e textos no código** (rótulos, janelas, ações destrutivas, mensagens), com o parser do TypeScript
   sobre os 377 `.tsx`.

Os achados altos foram conferidos de novo, direto no código. A Etapa 3 já mediu contraste (TEL-006) e tamanho de toque
(TEL-007); aqui eles só ganham números novos.

## Resumo

36 achados: **0 críticos, 3 altos, 13 médios, 20 baixos.**

**Os 3 altos são de clique que apaga ou cancela sem querer:**
- **ACE-01** — em "Apagar pedido" da Conferência (que apaga também o lançamento no financeiro) e em "Remover categoria",
  a pergunta "tem certeza?" aparece, mas a exclusão **já foi disparada**. Clicar "Cancelar" não desfaz nada.
- **ACE-02** — "Estornar" nota (apaga os lançamentos dela no financeiro, **mesmo os já pagos**), "Excluir fechamento de
  caixa" e "Remover lançamento" apagam com um clique, sem perguntar.
- **TXT-01** — no cancelamento da NFC-e a janela pergunta o motivo e mostra **[Cancelar] [Salvar]**: "Cancelar" desiste,
  "Salvar" cancela a nota na Receita. O mesmo em 14 janelas (vale, pedido do delivery, comanda).

**O resto, em uma frase:** a moldura do painel está no padrão novo, mas o miolo de muitas telas não (só 38% dos
arquivos do painel estão limpos; `/cotar`, `/contar`, `/folga` e o quiosque não foram convertidos). Mais da metade dos
campos não tem rótulo ligado (o leitor de tela não sabe o que é cada campo), as janelas feitas à mão não fecham com Esc, e
150 lugares mostram o erro técnico do banco (em inglês) pra pessoa.

**Pedem decisão do Rafael:**
- **ACE-09** — o zoom está travado de propósito nos apps por link. Liberar pelo menos em `/pedir` (cliente de qualquer
  idade) e `/cotar` (fornecedor)?
- **Site e app das marmitas** têm identidade própria (site com a cor antiga da Brasa #C78340 e outras fontes; marmitas
  com a marca do Kern). Ficam assim ou entram no padrão do painel?

| Severidade | Achados |
|---|---|
| Alto (3) | ACE-01, ACE-02, TXT-01 |
| Médio (13) | VIS-01 a VIS-07, ACE-03 a ACE-06, TXT-02, TXT-03 |
| Baixo (20) | o resto |

---

## Robô de acessibilidade (axe) — números

126 telas × 2 combinações = 252 medições, 0 telas com erro, **49 medições sem nenhuma violação**. Todas as telas têm
`lang="pt-BR"`; nenhuma tem mais de um `<h1>`; 7 não têm `<h1>`.

| Regra do axe | Impacto | Telas | Elementos | Vira achado |
|---|---|---|---|---|
| `label` (campo sem rótulo) | crítico | 33 | 4.396 | ACE-04 |
| `select-name` (lista sem nome) | crítico | 28 | 932 | ACE-04 |
| `color-contrast` | sério | 57 | 4.237 | TEL-006 (já reportado; reforçado em VIS-01) |
| `label-title-only` (rótulo só no `title`) | sério | 6 | 1.474 | ACE-04 |
| `scrollable-region-focusable` (tabela que rola sem teclado) | sério | 13 | 16 | ACE-12 |
| `link-in-text-block` (link só pela cor) | sério | 4 | 7 | ACE-12 |
| `aria-conditional-attr` | sério | 1 (`/contagens/consumo`) | 718 | ACE-12 |
| `region` (conteúdo fora de região) | moderado | 119 | 153 | não (é o atalho "Início" do menu; inofensivo) |
| `meta-viewport` (zoom travado) | moderado | 8 | 16 | ACE-09 (decisão) |
| `landmark-one-main` / `page-has-heading-one` | moderado | 5 / 4 | — | ACE-08 |
| `empty-table-header` (coluna de ações sem nome) | menor | 25 | 76 | ACE-12 |

**Teclado:** em todas as 126 telas o Tab chega ao conteúdo; 1 tela foca um campo invisível (`/dashboard`, "Ver outro
dia"). Em 28 telas o foco num **campo de data** fica sem o anel do sistema (ACE-11).

**Falsos alarmes (não viram achado):** `/financeiro/caixa/[id]` e `/salao/caixa/movimentos/[id]` deram "404" porque o
robô (este e o da Etapa 3) passou o id do *caixa*, e as telas esperam o id do *fechamento* e do *recebimento*. Na
Etapa 3 elas ficaram como "ok" pelo mesmo motivo. **Corrigido no robô e medido de novo** com um fechamento e um
recebimento reais: as duas abrem, 0 violações no computador; no celular escuro, só contraste e `region` (como as outras).

---

## Ações que apagam e textos que enganam (os altos)

### [ACE-01] A pergunta "tem certeza?" aparece, mas a exclusão já aconteceu
- Severidade: **alto**
- Onde: `src/app/(painel)/conferencia/excluir.tsx:12-18` ("Apagar o pedido… remove o lançamento no financeiro") e
  `src/app/(painel)/categorias/client.tsx:148-155` (conferidos)
- O que acontece: o `onSubmit` é `async` e só chama `e.preventDefault()` depois do `await confirmar(...)`. Quando a função
  para no `await`, o evento já terminou sem ser impedido, e o React dispara a `action` do formulário na hora. O pedido e o
  lançamento são apagados com a janela ainda aberta; "Cancelar" não volta nada. Funcionava quando era o `window.confirm`
  (que trava a página); quebrou na troca pelo `confirmar()`.
- Evidência: são os 2 únicos `onSubmit` com confirmação no sistema. Por leitura (não cliquei: apagaria de verdade).
- Correção: `e.preventDefault()` primeiro, e depois de confirmar chamar a ação; ou `<BotaoAcao aoClicar>` com `confirmar`.
- Esforço: P · Risco: baixo

### [ACE-02] Ações de dinheiro, nota e pessoas que apagam com um clique
- Severidade: **alto** (as 3 primeiras); médio (o resto)
- Onde, do mais grave:
  - **Estornar nota** — `notas/nota-acoes.tsx:19-23` e `:53` (conferido), `notas/[id]/lancamento.tsx:443`. O
    `estornarNota` (`notas/actions.ts:701-711`) apaga **todos** os lançamentos da nota, sem olhar se a conta já foi
    paga, e não confere erro. O "Cancelar" ao lado também não pede confirmação (`:42-48`).
  - **Excluir fechamento de caixa** — `financeiro/caixa/[id]/page.tsx:101` (apaga de vez, sem conferir erro).
  - **Remover lançamento manual** — `financeiro/lancamento-linha.tsx:142` (apaga de vez; `<button>` cru).
  - Tirar item da comanda: "×" no garçom (`(garcom)/garcom/comanda/[id]/page.tsx:168`) e no painel
    (`salao/comandas/[id]/page.tsx:222`), motivo fixo "Removido na comanda (×)", enquanto o caixa pede o motivo.
  - Zerar PIN (`colaboradores/client.tsx:151`), excluir cotação com as respostas (`cotacoes/page.tsx:111`), excluir
    cupom (`delivery/cupons/page.tsx:95`), excluir etiqueta (`etiquetas/lista.tsx:195`), cancelar reserva
    (`reservas/agenda.tsx:401`), cancelar QR do Pix (`components/pix-qr.tsx:160`).
- Evidência: 88 ações com verbo de apagar/cancelar chamadas em 87 lugares; 34 sem confirmação; lidas uma a uma, tirados
  os falsos. EST-02 (Remover contagem) já estava reportado.
- Correção: `confirmar(..., { perigo: true, okTexto: "Estornar" })`. No estorno, recusar (ou avisar) quando houver
  parcela paga.
- Esforço: P · Risco: baixo

### [TXT-01] "Cancelar" com dois sentidos na mesma janela, inclusive no cancelamento da NFC-e
- Severidade: **alto**
- Onde: `salao/notas-fiscais/notas-client.tsx:76-80` (conferido): o botão "Cancelar" da nota abre "Motivo do
  cancelamento" com **[Cancelar] [Salvar]** (`components/dialogo.tsx:170`, `:185`: o `perguntar()` não aceita outro
  texto). Igual em `salao/caixa/vales/vales-client.tsx:153`, `delivery/[id]/detalhe.tsx:130`, `delivery/board.tsx:123`,
  `delivery/lista.tsx:209`, `salao/mesa/[mesa]/mesa-detalhe.tsx:118`, `salao/comandas/[id]/acoes.tsx:17` e `:71`,
  `salao/caixa/receber.tsx:136`; com `confirmar` ([Cancelar] [Confirmar]) em `cofre/cofre-tela.tsx:149`,
  `cozinha/cozinha-client.tsx:97`, `eu/[token]/rodizio/form.tsx:65`, `folga/[token]/app.tsx:254`.
- Evidência: 14 janelas. Só 22 dos 82 `confirmar` passam um texto próprio pro botão.
- Correção: `perguntar` aceitar `okTexto`/`voltarTexto`; nessas janelas, [Voltar] [Cancelar a nota].
- Esforço: P · Risco: baixo

---

## Acessibilidade

### [ACE-03] Janelas feitas à mão: não fecham com Esc, não prendem o foco
- Severidade: **médio**
- Onde: ~32 janelas `fixed inset-0` em 36 arquivos (ex.: `fornecedores/client.tsx:156`, `salao/caixa/receber.tsx:1077`,
  `salao/caixa/fechamento-z.tsx:116`, `retiradas/client.tsx:277`, `garcom/mesa/[mesa]/garcom-pedido.tsx:376`), com 5
  opacidades de fundo diferentes (40 a 80). É também o **VIS-14** (janelas feitas de 3 jeitos).
- O que acontece: 25 sem `role="dialog"`, 28 sem `aria-modal`; só `dialogo.tsx` e o menu lateral tratam Esc; nenhuma
  prende o foco (o Tab vai pra tela de trás) nem devolve o foco ao botão que abriu. No `dialogo.tsx`, o campo do
  `perguntar()` não tem rótulo e o detalhe não está ligado à janela.
- Correção: um `<Janela titulo onFechar>` (pode ser o `<dialog>` nativo com `showModal()`, que já traz Esc e foco
  preso) e migrar aos poucos; `aria-describedby` e devolução do foco no `dialogo.tsx`.
- Esforço: M · Risco: baixo

### [ACE-04] Mais da metade dos campos não tem rótulo ligado
- Severidade: **médio**
- Onde: padrão `<label>Nome</label><input/>` lado a lado, sem `htmlFor`. Piores: `reservas/agenda.tsx` (27),
  `colaboradores/client.tsx` (15), `fiscal/perfis/perfis-client.tsx` (12), `fornecedores/client.tsx:172-217` (9),
  `financeiro/contas/page.tsx` (9); `login/page.tsx:58-80` sem rótulo ligado e sem `autoComplete`.
- Evidência: no código, 577 de ~990 campos visíveis sem rótulo, `aria-label` nem `title` (294 só com o texto de
  exemplo, que some ao digitar; 283 sem nome nenhum, 123 deles `<select>`); `htmlFor` aparece 29 vezes no sistema. No
  robô: `label` em 33 telas (4.396 elementos), `select-name` em 28 (932).
- Correção: `<label>` envolvendo o campo (mecânico) ou um `<Campo rotulo>` comum; login com `autoComplete="email"` e
  `"current-password"`.
- Esforço: M · Risco: baixo

### [ACE-05] App do cliente (/pedir) e telefones sem ajuda do celular
- Severidade: **médio**
- Onde: `pedir/pedir-client.tsx:583-635` (nome, telefone, endereço sem `autoComplete`; 13 de 14 campos só com texto de
  exemplo); telefone/WhatsApp/CNPJ sem `type="tel"`/`inputMode` em `fornecedores/client.tsx:187,207,217`,
  `colaboradores/client.tsx:505`, `delivery/entregadores/page.tsx:71`, `feriados/eventos-client.tsx:119`,
  `salao/cardapio/client.tsx:851`, `reservas/agenda.tsx:459`
- Evidência: `autoComplete` aparece 7 vezes no sistema, 6 delas `off`.
- Correção: `autoComplete="name|tel|street-address…"` e `inputMode="tel"|"numeric"`.
- Esforço: P · Risco: baixo

### [ACE-06] Avisos e erros aparecem, mas o leitor de tela não fala
- Severidade: **médio**
- Onde: 107 blocos `{erro && <p>}`/`{msg && …}` em 86 arquivos; só 4 com `role="alert"`/`status`. Ex.:
  `login/page.tsx:84`, `eu/[token]/pin.tsx:49` e `:84`, `pdv/pdv-client.tsx:284`, `salao/caixa/receber.tsx:1258`.
- Correção: `role="alert"` no erro, `role="status"` no sucesso (mecânico).
- Esforço: P · Risco: baixo

### [ACE-07] 47 botões que são só um símbolo, sem nome
- Severidade: baixo
- Onde: ✕ × + − ‹ › ← → em 27 arquivos (ex.: `garcom-pedido.tsx:328,379,398`, `salao/comandas/[id]/cliente.tsx:278,315,323`,
  `salao/caixa/dividir-conta.tsx:121`, `entrega/[token]/entrega-client.tsx:407,409`, `folga/[token]/app.tsx:159,161`)
- O que acontece: o leitor de tela lê "multiplicação", "mais".
- Correção: `aria-label` ("Fechar", "Mais um", "Mês anterior").
- Esforço: P · Risco: baixo

### [ACE-08] 63 de 150 páginas sem título próprio na aba; "· Brasa" escrito fixo
- Severidade: baixo
- Onde: no robô, 51 telas com o título "Brasa Pizzaria e Restaurante" (ex.: `/salao/caixa`, `/financeiro`, `/notas`,
  `/produtos`); `(painel)/layout.tsx:18` sem `template`; 49 títulos com "· Brasa" fixo (não serve pro multiempresa); 7
  telas sem `<h1>` (`/cozinha`, `/garcom/comanda/[id]`, `/pedir/acompanhar/[id]`, `/colaboradores/ponto/espelhos`…).
- Correção: `title: { template: "%s · " + empresa.nome }` no layout; cada página só com o nome da tela.
- Esforço: P · Risco: baixo

### [ACE-09] Zoom travado nos apps por link (decisão do Rafael)
- Severidade: baixo
- Onde: `maximumScale: 1, userScalable: false` + `<SemZoom/>` em 12 rotas (garçom, eu, entrega, folga, contar, cotar,
  e, garcom-avulso, pedir, tv, cozinha). O robô marcou 8 telas.
- Efeito: quem enxerga pouco não consegue ampliar (falha o critério 1.4.4 da WCAG AA). Pesa mais em `/pedir` (público)
  e `/cotar` (fornecedor), que não são telas de serviço rápido.
- Sugestão: manter nos apps de serviço (garçom, entrega, eu, TV) e liberar em `/pedir` e `/cotar`.

### [ACE-10] Ainda sobram 4 caixas do navegador, e 2 apps caem nelas sem querer
- Severidade: baixo
- Onde: `delivery/entregadores/caixa/fechamento.tsx:46`, `delivery/campanhas/[id]/acoes.tsx:13`,
  `salao/caixa/tef/tef-lista.tsx:136` (`prompt`), `components/sair-do-aparelho.tsx:24`. E `cotar/[token]/preencher.tsx:338`
  e `folga/[token]/app.tsx:254` chamam `confirmar()`, mas os layouts de `/cotar` e `/folga` não montam `<Dialogos/>`.
- Correção: montar `<Dialogos/>` nesses dois layouts e trocar as 4 chamadas.
- Esforço: P · Risco: baixo

### [ACE-11] Campo de data sem o anel de foco do sistema
- Severidade: baixo
- Onde: regra global em `src/app/globals.css:481-494` (`:focus-visible`)
- O que acontece: no Chrome, ao chegar pelo Tab num `<input type="date|month|time">`, o foco vai pra parte interna (dia,
  mês) e o campo não casa com `:focus-visible`: sai sem o anel laranja (só o realce azul do navegador no pedaço do dia).
- Evidência: robô, 28 telas, 47 campos; conferido em `/cardapio-do-dia`, `/cozinha/recados` e
  `/colaboradores/ponto/diario` (`type="date"`, `:focus-visible` falso, `outline: none`).
- Correção: incluir `input[type=date|month|time|datetime-local]:focus-within` na regra global.
- Esforço: P · Risco: baixo

### [ACE-12] Detalhes do robô: tabelas que rolam sem teclado, colunas sem nome, link só por cor
- Severidade: baixo
- Onde: `scrollable-region-focusable` em 13 telas (tabelas `overflow-x-auto`, ex.: `/cofre`, `/contagens/consumo`,
  `/delivery/[id]`); `empty-table-header` em 25 (coluna de ações sem texto, ex.: `/categorias`, `/colaboradores`,
  `/conferencia`); `link-in-text-block` em 4 (`/colaboradores/assiduidade`, `/colaboradores/semana`,
  `/contagens/agendamentos`, `/motelli`); `aria-conditional-attr` em `/contagens/consumo` (718: `tr` com
  `aria-expanded`, sem teclado, `consumo-tabela.tsx:146`); `/dashboard` foca o campo invisível "Ver outro dia".
- Correção: `tabIndex={0}` + `aria-label` no contêiner que rola; `<th><span class="sr-only">Ações</span></th>`;
  sublinhar links no meio do texto; botão de verdade na linha que abre.
- Esforço: P · Risco: baixo

---

## Consistência visual

Contexto: o `globals.css` (linhas 91–155) já remapeia red, emerald, amber, blue e sky pra tons quentes; por isso
`text-red-600` não sai no vermelho de fábrica. Mas esses tons **não seguem a cor da empresa** e **não mudam no tema
escuro**; violet, indigo e pink nem são remapeados.

| Regra | Ocorrências | Arquivos |
|---|---|---|
| Cor de estado crua (red/emerald/amber/blue/sky) | 1.873 | 175 |
| — refino do TEL-006 (`text-red/emerald/green/amber/blue/orange-500/600/700`) | 881 (era 829) | 184 |
| Cor fora da paleta (violet, indigo, pink) | 72 | 11 |
| `bg/text/border-white/black` | 335 | 119 |
| Hex/rgb na tela (classe, string, `style`) | 143 | 33 |
| Raio proibido (`rounded`, lg, xl, 2xl, 3xl, md) | 280 | 73 |
| Texto branco em botão laranja | 8 | 7 |
| `outline-none` | **0** | 0 |
| `focus:ring` por campo | 10 | 8 |
| `<button>` cru chamando o servidor (11 sem `disabled`) | 103 | 36 |
| `.cartao-foco` mais de um por tela | **0** | — |
| Fonte escrita à mão no painel | **0** | — |

**Por área** (arquivos sem nenhuma das 6 regras principais): painel 84 de 223 (38%), `/eu` 14 de 29, `/garcom` 4 de 9,
`/pedir` 2 de 5, `/entrega` 1 de 3, `/folga` `/cotar` `/contar` 0 de 7, quiosque 0 de 2, componentes 8 de 22. **Nenhuma
área está 100%**; o que está limpo é a moldura (menu, layout do painel, salão, lista do delivery, comanda, `enviar.tsx`).

**Mais fora do padrão:** `cotacoes/[id]/comparar/comparar-client.tsx`, `salao/balanca/quiosque/quiosque.tsx`,
`colaboradores/semana/semana.tsx`, `cotar/[token]/preencher.tsx`, `contar/[token]/preencher.tsx`, `salao/caixa/receber.tsx`,
`folgas/gestao-folgas.tsx`, `salao/cardapio/client.tsx`, `components/etiqueta-ui.tsx`, `conferencia/[id]/conferir-client.tsx`.

### [VIS-01] No tema escuro, textos de estado ficam apagados (refino do TEL-006)
- Severidade: **médio**
- Onde: 335 `text-(red|emerald|amber|green)-600..900` sem par `dark:` em 120 arquivos (painel 266, apps 47, quiosque 12,
  componentes 9). Piores: `semana.tsx` (14), `delivery/novo/novo-client.tsx` (12), `pedir/pedir-client.tsx` (12),
  `pdv/pdv-client.tsx` (11), `financeiro/banco/banco-tabela.tsx` (10), `retiradas/client.tsx` (10).
- Evidência: contraste sobre o cartão escuro (#1f1611): red-600 3,1:1; emerald-600 3,6; blue-600 2,5; red-700 2,3. No
  garçom (sempre escuro), "Comanda fechada" (`garcom/comanda/[id]/page.tsx:191`) ~2,5:1. Robô: `color-contrast` em 57 telas.
- Correção: `text-ok-texto`/`text-urgente-texto`/`text-info-texto` (já viram nos dois temas), por codemod.
- Esforço: M · Risco: baixo

### [VIS-02] A cor antiga da marca (#C78340 / #211915) ainda está escrita no código
- Severidade: **médio** (não gira pra cor de outra empresa)
- Onde: `components/etiqueta-ui.tsx:225`, `salao/caixa/vales/vales-client.tsx:358`, `cozinha/cozinha-client.tsx:110,127`,
  `lib/rodizio.ts:40`, `lib/mapa-icones.ts:30,37`, `delivery/mapa-google.tsx:106`, `delivery/areas/areas-client.tsx:19,46`,
  `delivery/areas/actions.ts:18`, `lib/eventos.ts:24`, `lib/feriados.ts:37`, `lib/vale-cartao-imagem.ts:11`,
  `checklists/modelos/modelos-client.tsx:21`, `tv/mural/mural-tv.tsx:109`
- Evidência: 16 linhas (`grep -rn "C78340\|c78340\|211915" src`). A marca atual é #E57A2C.
- Correção: ler de `paletaDaEmpresa()` ou `var(--marca-primaria)`.
- Esforço: P · Risco: baixo

### [VIS-03] Texto branco em botão laranja
- Severidade: **médio**
- Onde: `salao/balanca/page.tsx:39, 92`, `salao/balanca/leitor.tsx:146`, `contagens/[id]/contar.tsx:512`,
  `cozinha/recados/recados-client.tsx:57`, `financeiro/cmv/page.tsx:299`, `balanca-teste/page.tsx:131`,
  `components/etiqueta-ui.tsx:225` (conferidos os 3 primeiros)
- Evidência: branco sobre #E57A2C = 2,9:1; no recados (`bg-orange-600`) no escuro o fundo vira #FFB25E e cai pra 1,8:1.
  A regra do projeto é texto grafite sobre laranja.
- Correção: `.btn-principal` ou `text-marca-sobre-primaria`.
- Esforço: P · Risco: baixo

### [VIS-04] O cartão "Abrir caixa" foi feito à mão e os rótulos dele quase não se leem
- Severidade: **médio** (tela de todo dia)
- Onde: `salao/caixa/page.tsx:80-101` (conferido): `bg-painel-foco-fundo` em vez de `.cartao-foco`, rótulos em
  `text-texto-suave` sobre o fundo invertido (3,2:1 no claro, 2,2:1 no escuro), sem `.btn-foco` nem
  `text-painel-foco-rotulo`, e o anel do teclado sai laranja escuro sobre grafite.
- Correção: `cartao-foco` com `--foco` do cartão e rótulos em `text-painel-foco-rotulo`, como em `dashboard/inicio.tsx:199`.
- Esforço: P · Risco: baixo

### [VIS-05] Botões que chamam o servidor sem `<Enviar>`/`<BotaoAcao>`
- Severidade: **médio**
- Onde: 103 `<button>` em 36 arquivos; os 11 sem `disabled` (aceitam clique dobrado): `cardapio-do-dia/editor.tsx:711`,
  `colaboradores/semana/semana.tsx:545,612,661`, `fiscal/perfis/perfis-client.tsx:104`, `folgas/gestao-folgas.tsx:251,491,503`,
  `impressao/central.tsx:145`, `notas/[id]/lancamento.tsx:390`, `salao/notas-fiscais/notas-client.tsx:179`
- Correção: `<BotaoAcao aoClicar>`, começando pelos 11.
- Esforço: M · Risco: baixo

### [VIS-06] Quiosque da balança fora do padrão (refino da pendência 7 do inventário)
- Severidade: **médio** (é a tela que o cliente vê)
- Onde: `salao/balanca/quiosque/quiosque.tsx:868-1414`, `salao/balanca/leitor.tsx`
- Evidência: 45 raios proibidos, 28 branco/preto, 27 cores de estado, 3 botões laranja à mão (~100 desvios; o "~27" do
  inventário eram só as cores).
- Correção: uma passada com `rounded-cartao/controle`, `.btn-principal` e tokens.
- Esforço: M · Risco: baixo

### [VIS-07] Os apps /cotar, /contar e /folga (e o login) ficaram fora da conversão
- Severidade: **médio**
- Onde: `cotar/[token]/preencher.tsx`, `contar/[token]/preencher.tsx`, `folga/[token]/app.tsx`, `login/page.tsx`
- Evidência: 0 de 7 arquivos limpos; 43 raios proibidos, 15 `focus:ring`, 11 violet, ~100 cores.
- Correção: converter como foi feito no `/eu`.
- Esforço: M · Risco: baixo

### [VIS-08] Tablet da cozinha e TV com cores fora de `tv-cores.ts`
- Severidade: baixo
- Onde: `cozinha/cozinha-client.tsx:72,83,87,98,110,127` (18 hex de fábrica do Tailwind), `components/rodizio-card.tsx:49,55,68`,
  `tv/tv-client.tsx:183`, `tv/page.tsx:26,38`, `tv/mural/mural-tv.tsx:29-30`
- Correção: `TV.*` (falta um verde "ok" e um vermelho "atraso" em `tv-cores.ts`).
- Esforço: P · Risco: baixo

### [VIS-09] Cores que não existem na paleta (violet, indigo, pink)
- Severidade: baixo
- Onde: 72 em 11 arquivos (`comparar-client.tsx:699`, `semana.tsx:681`, `parcelas-editor.tsx:97`, `cotar preencher.tsx:530`,
  `lancamento.tsx:312`, `colaboradores/client.tsx:364`, `conferencia/page.tsx:121`, `delivery/board.tsx:79`,
  `produtos/client.tsx:659`, `reservas/hoje/mobile.tsx:100`, `entrega-client.tsx:309`). Saem no tom frio do Tailwind.
- Correção: `pilula-info`/`pilula-neutra`, ou remapear violet no `globals.css`.
- Esforço: P · Risco: baixo

### [VIS-10] Etiquetas e cartões feitos à mão em vez das peças prontas
- Severidade: baixo
- Evidência: 171 "fundo de estado + texto da mesma cor" sem `pilula` em 87 arquivos (contra 110 usos de `.pilula*`); 116
  cartões com borda (`rounded-cartao border`) em 66 arquivos, e a regra é cartão sem borda.
- Correção: `pilula-ok/-urgente/-info` e `.cartao`.
- Esforço: G · Risco: baixo

### [VIS-11] Raios fora dos três padrões
- Severidade: baixo
- Onde: 280 em 73 arquivos (painel 107, componentes 57). `components/esqueleto.tsx:14` (`rounded-md`) aparece em todo
  carregamento; `salao/caixa/loading.tsx` (9), `marmita-dia-form` (7), `pix-qr` (6).
- Correção: codemod lg/md/`rounded` → `rounded-controle`; xl/2xl/3xl → `rounded-cartao`.
- Esforço: M · Risco: baixo

### [VIS-12] Emoji na tela além das exceções combinadas
- Severidade: baixo
- Onde: `impressao/central.tsx` (12 linhas), `etiquetas/impressas/page.tsx:36` (no `<h1>`), `etiquetas/etiqueta-form.tsx:214`,
  `etiquetas/lista.tsx:86` e `etiqueta-ui.tsx:252` (de `lib/etiqueta-tipos.ts:6-10`), `colaboradores/ponto/page.tsx:216`
  (☑/☐ no lugar de caixa de marcar), `mural/mural.tsx:205`. A memória de ícones fala em 6 linhas e está desatualizada.
- Correção: `<Icone>` e checkbox de verdade.
- Esforço: P · Risco: baixo

### [VIS-13] Anel de foco escrito por campo (dois anéis)
- Severidade: baixo
- Onde: `categorias/client.tsx:24`, `colaboradores/client.tsx:208`, `contagens/[id]/contar.tsx:26,28`,
  `fornecedores/client.tsx:10`, `produtos/client.tsx:56`, `contar preencher.tsx:461`, `login/page.tsx:66,79`,
  `components/estoque-input.tsx:38`
- Correção: tirar o `focus:ring-*` (a regra global já cuida).
- Esforço: P · Risco: baixo

### [VIS-14] Janelas feitas de três jeitos
- Ver **ACE-03** (mesmo problema: `dialogo.tsx` em 82 arquivos, ~30 janelas à mão, 4 caixas do navegador).

### [VIS-15] Leitor de câmera em 5 versões, com 3 bibliotecas
- Severidade: baixo
- Onde: `components/leitor-qr.tsx` (zxing; só o `/contar` usa), `eu/[token]/baixa/scanner.tsx` (zxing), `garcom/busca.tsx`
  (zxing), `etiquetas/scanner/scanner.tsx` (BarcodeDetector), `entrega-client.tsx:516` (jsQR), cada um com a sua moldura.
- Correção: todos usarem o `leitor-qr`.
- Esforço: M · Risco: médio

### [VIS-16] Filtros em três formatos, e o "ativo" em quatro cores
- Severidade: baixo
- Onde: pílula em 14 arquivos; segmento em `financeiro/contas/page.tsx:96-108`, `gestao-folgas.tsx:92`,
  `retiradas/client.tsx:85`, `checklists/apontamentos/apontamentos-client.tsx:31`, `delivery/novo/novo-client.tsx:145`,
  `salao/mesa/[mesa]/mesa-detalhe.tsx:173`; aba sublinhada em `colaboradores/ponto/page.tsx`, `colaboradores/[id]/page.tsx`,
  `feriados/page.tsx`. O ativo: `bg-texto text-fundo` (21 arquivos), `bg-zinc-900 text-white` (7), `bg-marca-escuro` (5),
  `bg-painel-foco-fundo` (3).
- Correção: um `<FiltroPilula>` comum.
- Esforço: M · Risco: baixo

### [VIS-17] Títulos e cabeçalhos de lista sem padrão único
- Severidade: baixo
- Onde: 151 `<h1>` com a classe à mão: 28 px em ~93, 30 px em ~18, e fora dos dois `delivery/novo/novo-client.tsx:136`,
  `pdv/pdv-client.tsx:222`, `salao/cardapio/combos/[id]/page.tsx:48`, `reservas/hoje/mobile.tsx:62`. Cabeçalho de tabela:
  73 de 87 usam `.rotulo`; o módulo do ponto (feito depois da conversão) ficou de fora (`ponto/page.tsx:231,304,364,379`,
  `ponto/diario/page.tsx:92`, `ponto/relatorios/page.tsx:136,222,264,314`) e `salao/cardapio/client.tsx:762`.
- Correção: `<TituloPagina>`; trocar a constante `CAB` do ponto por `rotulo`.
- Esforço: P · Risco: baixo

### [VIS-18] Botões laranja e campos repetidos arquivo por arquivo
- Severidade: baixo
- Evidência: 36 botões laranja sem `.btn-principal` em 27 arquivos, com 7 alturas diferentes (ex.:
  `etiquetas/itens/itens-client.tsx:103,126,174`, `formas-pagamento/client.tsx:161,229`, `salao/comandas/[id]/cliente.tsx:364,564`,
  `eu/[token]/compras/form.tsx:65`, `components/vigia-versao.tsx:113`); 46 constantes locais de estilo de campo (21 com
  `min-h-11`, as outras com 9, 10, 12 ou sem altura).
- Correção: `.btn-principal`; uma classe `.campo` no `globals.css`.
- Esforço: M · Risco: baixo

### [VIS-19] Gráfico do Consumo: "média X" some atrás das barras (observação da Etapa 3, confirmada)
- Severidade: baixo
- Onde: `contagens/consumo/consumo-tabela.tsx:56-57`: a linha e o texto da média são desenhados antes das barras
  (`:59-66`); no SVG, o que vem depois pinta por cima.
- Correção: desenhar o texto depois das barras, com um fundo.
- Esforço: P · Risco: baixo

---

## Textos

### [TXT-02] O erro técnico do banco aparece direto pra pessoa
- Severidade: **médio**
- Onde: 150 lugares devolvem `error.message` do Supabase/Postgres pra tela (138 direto, 12 com prefixo) em 51 arquivos;
  mais: `colaboradores/semana/actions.ts` (13), `colaboradores/ponto/actions.ts` (8), `salao/actions.ts` (7),
  `lib/cofre-core.ts` (6), `checklists/actions.ts` (6). Só `formas-pagamento/actions.ts:121` traduz.
- O que acontece: a tela mostra coisas como "duplicate key value violates unique constraint…".
- Correção: um `explicarErro(error)` comum (repetido, ligado a outro cadastro, sem permissão, sem rede), com o texto
  original só no log (junto do COD-004).
- Esforço: M · Risco: baixo

### [TXT-03] Gravação que falha em silêncio
- Severidade: **médio**
- Onde: ~379 `await supabase.from(..).delete/update/insert/upsert(...)` com o resultado descartado em 77 arquivos (contra
  ~173 que guardam o `error`). Os que importam: `excluirFechamento` (`financeiro/caixa/actions.ts:128`),
  `estornarNota`/`cancelarNota` (`notas/actions.ts:701-721`, conferido), `excluirLancamento` (`financeiro/actions.ts:111`),
  `zerarPinColaborador`.
- O que acontece: se o banco recusar, a tela age como se tivesse dado certo. (O COD-004 é sobre log; este é o que a pessoa vê.)
- Correção: nas ações de dinheiro, nota e pessoas, conferir o `error` e devolver `{ ok:false, mensagem }`.
- Esforço: M · Risco: baixo

### [TXT-04] O mesmo ato com nomes diferentes
- Severidade: baixo
- Evidência: Apagar 21, Excluir 17, Remover 17, Tirar 36; 12 em minúscula. Na mesma peça: `conferencia/excluir.tsx:23`
  ("Apagar pedido") com `:26` ("Excluir"); `salao/caixa/receber.tsx:964` ("Remover") com `:967` ("Excluir item"). Item
  da comanda: "×" no garçom, "Tirar" no painel, "Excluir item" no caixa. Fechar janela: "Cancelar" (29), "Fechar" (16),
  "✕/×" (~20). "Salvar" está uniforme.
- Correção: regra curta (Excluir = some de vez; Desativar = sai da lista; Cancelar = só pra nota/pedido; Fechar = fecha
  janela), começando por dinheiro e nota.
- Esforço: M · Risco: baixo

### [TXT-05] Datas no servidor sem fuso, e valores em R$ montados à mão
- Severidade: baixo
- Onde: 28 de 119 formatações de data sem `timeZone`, 11 no servidor (UTC). Erros reais: nome padrão "Contagem DD/MM" e
  "Cotação DD/MM" (`contagens/actions.ts:16`, `cotacoes/actions.ts:15`) sai com o dia seguinte depois das 21h; "visto às"
  da balança (`salao/balanca/page.tsx:58`) 3 h adiantado; também `cotacoes/[id]/comparar/page.tsx:300`,
  `delivery/cashback/page.tsx:138`, `e/[id]/page.tsx:31`. Dinheiro: 106 helpers locais em 104 arquivos (o `moedaBR` de
  `lib/format.ts` é importado em 41), quase todos iguais; divergência real em 13 mensagens com `toFixed(2)` sem ponto de
  milhar ("R$ 1234,50": `lib/delivery-core.ts:304,314`, `pedir/pedir-client.tsx:154,299`, `lib/cofre-core.ts:100,136`,
  `salao/actions.ts:687`, `salao/pix-actions.ts:109`) e em `financeiro/banco/actions.ts:127` ("R$ 105712.00").
- Correção: `moedaBR`/`dataBR` nas mensagens; `timeZone: "America/Sao_Paulo"` no servidor.
- Esforço: P · Risco: baixo

### [TXT-06] Erro vago de reserva e lista vazia sem próximo passo
- Severidade: baixo
- Onde: 33 textos de reserva ("Erro.", "Falhou", "Não foi possível concluir.", ex.: `eu/[token]/pin.tsx:25,67`,
  `solicitacoes/client.tsx:78,284`, `pdv/pdv-client.tsx:140,163`); listas de cadastro vazias sem apontar o botão de criar
  ("Nenhum cliente." em `clientes/client.tsx:135`, "Nenhum produto.").
- Correção: reserva que diz o que fazer ("Não salvou. Confira a internet e tente de novo."); lista vazia com o botão de criar.
- Esforço: P · Risco: baixo

---

## Verificado e OK

- `outline-none`: 0 (a regra global de foco está valendo); nenhum `tabIndex` positivo; atalho "Pular para o conteúdo"
  e `<main id="conteudo">` no painel; `lang="pt-BR"` em todas as telas.
- Teclado: o Tab chega ao conteúdo nas 126 telas.
- Botões só com ícone: todos têm nome (o `<Icone>` vira imagem com `aria-label`); nenhuma `<img>` sem `alt`.
- `.cartao-foco`: no máximo um por tela (11 arquivos); fontes nunca escritas à mão no painel; TV quase toda em `TV.*`.
- `dialogo.tsx` certo no básico: `alertdialog`, `aria-modal`, Esc, foco no botão principal.
- Tratamento sempre "você" (69 "você", 0 "tu"; 2 imperativos no "tu").
- 91 de 119 datas já com fuso; "Salvar" uniforme; `error.tsx` claro, com saída e código do erro.
- Site e marmitas: identidade própria de propósito (decisão pendente acima); o balão do WhatsApp em
  `seletor-modelo.tsx:106` imita o app de propósito.

## Não deu pra verificar

- ACE-01 por clique (apagaria de verdade); a conclusão vem do código do React 19.
- Se a Vercel tem `TZ` configurado (se tiver, o TXT-05 do servidor some).
- Leitor de tela de verdade (TalkBack, VoiceOver) e o efeito do SemZoom no iPhone.
- Contraste real dos fundos translúcidos; TV e quiosque no tamanho real.
