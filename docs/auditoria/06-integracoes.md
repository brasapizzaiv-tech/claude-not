# Etapa 6 — Integrações e o que roda fora do navegador

Feita em 09/11/2026 (segunda, madrugada), com a versão `b19f87b` no ar. Só leitura: código lido e banco de produção
consultado em modo só leitura (`scripts/auditoria/db.mjs`). Nada foi disparado: nenhuma nota, Pix, pinpad, WhatsApp,
aviso no celular, impressão, rotina ou serviço de fora (Google, Sicoob, Focus, SEFAZ, Meta, Firebase). Da Vercel, só os
nomes das variáveis e as datas dos deploys. Cinco frentes em paralelo (nota fiscal e SEFAZ; Pix e pinpad; agentes dos
PCs; WhatsApp, avisos e apps; rotinas e serviços de fora). Os mais graves de cada frente foram conferidos de novo, direto
no código e no banco, antes de entrar aqui.

Por privacidade (o repositório é público), pessoas aparecem só por id curto, número de comanda ou NSU.

## Resumo

49 achados: **0 críticos, 0 altos, 18 médios, 31 baixos** (o CRN-06 é o mesmo do NFE-05 e ficou só como referência). Hoje não tem nada quebrado: fila de impressão vazia (0 de
7.934), ponto sem buraco (NSR 1 a 2.985), pedido do Kern certo 76 de 76 dias, Pix pago casando com o caixa 207 de 207,
nenhuma NFC-e em dobro, nenhum aviso de WhatsApp repetido.

O padrão que se repete nas cinco frentes é **falha calada**: quando algo de fora para (agente do PC, SEFAZ, Sicoob, Meta,
Google, relógio de ponto), o sistema não avisa ninguém. Quem descobre é o cliente, o cozinheiro sem papel ou o
fornecedor cuja nota não chegou.

**O Rafael precisa conferir fora do sistema (só ele tem acesso):**
1. **PAG-01** — extrato da **Bin**: o cartão de **R$ 48,90 da comanda 246, em 05/11 (NSU 031323, Lecard Voucher)**
   entrou? O sistema marcou como "desfeito" (devolvido ao cliente), mas a venda ficou no caixa.
2. **PAG-02** — extrato do **Sicoob**: algum dos 9 QR "cancelados" (R$ 313,41, de 24/09 a 27/10) ou o de R$ 29,80 de
   28/10 foi pago depois? Cancelar na tela não cancela no banco.
3. **NFE-01** — painel da **Focus**: as 62 NFC-e emitidas em contingência (a maioria de 13 a 17/10) foram todas
   confirmadas pela SEFAZ depois?
4. **CRN-02** — **Google Cloud**: pôr um teto de gasto/cota diária na chave do Maps (não precisa de código).

**Pedem decisão:**
- **MSG-06** — quando o WhatsApp voltar, os 3 telefones do convênio Kern vão receber "saiu" e "entregue" de cada entrega
  de marmita, todo dia. É pra receber?
- **Pix pelo QR do Sicoob × Pix na máquina** — desde 16/10 foram 192 Pix na máquina (R$ 21.707, com taxa da adquirente)
  contra 0 pelo QR do Sicoob (sem taxa; o último pago foi em 15/10). Antes, 95–98% passavam pelo QR. Foi escolha?

| Severidade | Achados |
|---|---|
| Médio (18) | NFE-01 a NFE-03, PAG-01 a PAG-04, AGT-01 a AGT-06, MSG-01 a MSG-04, CRN-01 |
| Baixo (31) | o resto |

**Sobra do SEC-12:** as 7 rotinas ainda aceitam a senha pela URL (`?key=`), e a correção pedia tirar. A
`WHATSAPP_APP_SECRET` já está valendo em produção (criada antes do último deploy).

---

## Nota fiscal e SEFAZ

### [NFE-01] O sistema nunca confere a NFC-e depois de emitida; 62 notas em contingência sem confirmação
- **Corrigido em 09/11/2026 (Onda 1 da correção).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio**
- Onde: `src/lib/fiscal/focus.ts:157-176` (`consultarNfce` existe e nada chama); `focus.ts:138` (`processando_autorizacao`
  conta como ok); `src/lib/fiscal/pendentes.ts:50-55`; trava contra nota em dobro em `salao/fiscal-actions.ts:118-127`
  (só olha `autorizado`)
- O que acontece: quando a SEFAZ não responde, a Focus emite offline (contingência) e transmite depois. O resultado final
  vem na consulta ou no webhook `nfce_contingencia`. O sistema grava "autorizado" na hora e nunca mais olha. Se a
  transmissão de depois for recusada, ninguém fica sabendo. Uma nota "processando" ficaria assim pra sempre e não
  bloquearia uma segunda emissão da mesma comanda.
- Evidência: 62 de 2.818 NFC-e autorizadas são de contingência (set 5, out 55, a maioria de 13 a 17/10, nov 2). Na série
  11 (1 a 2.881) faltam 63 números; 61 ficam logo antes de uma nota de contingência, que é o número que a Focus
  inutiliza. Hoje: 0 "processando", 0 comandas com duas notas.
- Correção: guardar o estado da contingência; rotina que consulta as de contingência/processando e atualiza; mostrar
  "aguardando SEFAZ" ou "recusada depois" em Notas fiscais; a trava contra nota em dobro passa a olhar "processando".
- Esforço: M · Risco: baixo

### [NFE-02] As buscas "forçadas" na SEFAZ pulam a espera de 1 hora (risco do 656)
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio** (risco; não dá pra medir, ver NFE-03)
- Onde: `src/lib/sefaz/busca.ts:79` (`forcar` ignora `bloqueado_ate`); usado em `api/sefaz/completar/route.ts:90` e `:115`
  (a cada 5–15 min por até 3 h depois de manifestar e na autocura a cada 8 h) e em `notas/sefaz-actions.ts:114`, `:128`
  ("Buscar itens agora", sem limite de clique) e `:164`
- O que acontece: depois do 137 ("nenhum documento"), a regra é esperar 1 h; consultar antes renova o bloqueio (o próprio
  comentário em `busca.ts:81` diz isso). A busca forçada repete de 5 em 5 min. Se cair num 656, cada nova tentativa
  estica o castigo, e o XML do fornecedor demora mais.
- Evidência: código conferido. Últimos 30 dias: 112 manifestações (61 em lote). Hoje 0 notas manifestadas sem itens.
- Correção: depois de 137/656, nada forçado até `bloqueado_ate`; no máximo uma tentativa ~10 min depois de manifestar;
  "Buscar itens agora" e "Reprocessar" no máximo 1 por hora.
- Esforço: P · Risco: baixo

### [NFE-03] Falha da SEFAZ não aparece pra ninguém: 656, certificado vencendo, rotina parada
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio**
- Onde: `api/sefaz/cron/route.ts:31-32` e `completar/route.ts:92,116` (resultado só no JSON pra Vercel);
  `src/lib/sefaz/distribuicao.ts:158` (656 não é tratado como erro); `notas/sefaz/sefaz-painel.tsx:105-114` (mostra
  "✓ … SEFAZ: 656"); `cron_hora_em`/`cron_completar_em` são gravados e ninguém lê; nenhum aviso de validade do
  certificado A1
- O que acontece: se o certificado vencer, a SEFAZ der 656 seguido ou a rotina parar, as notas dos fornecedores param de
  chegar sem aviso. O mesmo e-CNPJ serve à Focus e ao Pix: o vencimento derruba os três juntos.
- Evidência: hoje as rotinas rodam (05:00:50 e 05:10:47 UTC de 09/11).
- Correção: gravar a última resposta (cStat, motivo, hora); 656 vira erro na tela; aviso na tela inicial quando a última
  busca boa tiver mais de 6 h ou o certificado faltar menos de 30 dias (guardar só a data de validade no upload).
- Esforço: M · Risco: baixo

### [NFE-04] Manifestação recusada aparece como "✓ Manifestada"
- Severidade: baixo
- Onde: `src/lib/sefaz/manifestacao.ts:144-151` (recusa volta `ok:false` com `erro` vazio); `notas/sefaz-actions.ts:103-107`;
  `notas/[id]/manifestar.tsx:24-29`
- O que acontece: a nota continua só em resumo e a busca não vai atrás dela; quem clicou acha que deu certo.
- Evidência: 32 resumos nunca manifestados (14 com menos de 60 dias, R$ 122.308; 10 com mais de 90 dias).
- Correção: devolver cStat e motivo quando `!r.ok`; o lote conta por `r.ok`.
- Esforço: P · Risco: baixo

### [NFE-05] A busca de hora em hora perde a vez por 1 segundo; o comentário diz "1x por dia"
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: baixo
- Onde: `busca.ts:164-166` (trava de exatamente 1 h); `api/sefaz/cron/route.ts:5`; `vercel.json` (`0 * * * *` e `*/5`, os
  dois no minuto :00)
- O que acontece: a busca termina às hh:00:51 e trava até hh+1:00:51; o próximo disparo chega às hh+1:00:50 e é barrado.
  Várias horas ficam sem busca. No minuto :00 o cron e a busca forçada podem rodar juntos com o mesmo NSU (a chave única
  da nota segura a duplicidade; **mesmo achado que a frente de rotinas registrou**).
- Evidência: `bloqueado_ate` 05:00:51.036 × `cron_hora_em` 05:00:50.276 em 09/11.
- Correção: cron em `5 * * * *` (ou `3`) e folga de 2–3 min na trava; corrigir o comentário.
- Esforço: P · Risco: baixo

### [NFE-06] Falha ao importar um documento da SEFAZ é pulada sem registro
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: baixo
- Onde: `busca.ts:114-154` (soma em `falhas` e o NSU avança); `notas/actions.ts:122-124` e `:153-155` (insert dos itens sem
  conferir erro)
- O que acontece: o documento que falhou ao gravar não volta sozinho; nota pode ficar "completa" sem itens.
- Correção: gravar as falhas; não avançar o NSU além do primeiro erro de gravação; conferir o insert dos itens.
- Esforço: P · Risco: baixo

### [NFE-07] Cancelamento marca "cancelado" sem confirmar
- **Corrigido em 09/11/2026 (Onda 1 da correção).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: baixo (nunca usado: 0 notas canceladas)
- Onde: `focus.ts:178-196`, `:290-300`; `salao/fiscal-actions.ts:376-379`; `notas-fiscais/notas-client.tsx:192` (botão em
  toda nota, mesmo depois dos 30 min da NFC-e)
- Correção: gravar "cancelando" e confirmar na consulta; try/catch com tempo limite; esconder o botão depois de 30 min.
- Esforço: P · Risco: baixo

### [NFE-08] O link do XML nunca é guardado nas NFC-e
- **Corrigido em 09/11/2026 (Onda 1 da correção).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: baixo
- Onde: `focus.ts:82-90` e `:137` (a NFC-e lê só `caminho_xml`; a NF-e também lê `caminho_xml_nota_fiscal`, `:252-254`)
- Evidência: 2.818 de 2.818 NFC-e com `url_xml` vazio; as NF-e têm. A impressão funciona por outro caminho.
- Correção: ler `caminho_xml_nota_fiscal` também na NFC-e.
- Esforço: P · Risco: baixo

---

## Pagamentos: Pix Sicoob, pinpad e Pix na máquina

Continuam abertos, sem repetir aqui: CX-05, DEL-01, DEL-02, DEL-03, o caso do PC cair nos ~3 s depois do CNF e o Pix de
teste fora da guarda.

### [PAG-01] "Desfeita" é deduzida, não vista: R$ 48,90 ficaram no caixa com o cartão marcado como devolvido
- **Corrigido em 09/11/2026 (Onda 1 da correção).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio**
- Onde: `src/lib/tef-guarda.ts:206-211` (conferido); `agente-tef/agente.mjs:252-254` e `:263`
- O que acontece: o agente só responde "nada pendente", sem dizer se confirmou ou desfez. Quando a 1ª tentativa de
  confirmar parecia ter falhado vista do navegador, a guarda conclui que foi desfeita. Uma queda de conexão pode
  acontecer com a confirmação já feita pelo agente: aí o sistema diz "devolvido" com o dinheiro recebido.
- Evidência: desde 05/11 12h30, 229 confirmadas, 25 negadas e **1 desfeita** (conferido): comanda **246**, R$ 48,90,
  Bin, Lecard Voucher, NSU 031323, criada 12:36:10, desfeita 12:37:00. O movimento de R$ 48,90 continua no caixa (já
  fechado), sem estorno.
- Correção: **agora**, o Rafael confere no extrato da Bin. Na próxima versão do agente: guardar os últimos ~50
  pagamentos com o que aconteceu, e o `/confirmar` responde "já confirmada" ou "desfeita". Até lá, marcar "a conferir"
  em vez de "desfeita" e mostrar em Cartões (TEF) e no Z.
- Esforço: M · Risco: médio (versão nova do agente nos 2 PCs)

### [PAG-02] "Cancelar QR" do Pix só cancela no sistema; o QR continua pagável no banco
- **Corrigido em 09/11/2026 (Onda 1 da correção).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio**
- Onde: `src/components/pix-qr.tsx:42-48` (o comentário promete "não sobrar QR fantasma pagável"), `:84-93`, `:103-106`;
  `salao/pix-actions.ts:42`, `:63-72`; `src/lib/pix.ts` não tem chamada de cancelamento (conferido)
- O que acontece: cancelar, sair da tela ou mudar o valor só grava "cancelado" no sistema. No Sicoob a cobrança segue
  ativa por 30 min. Se o cliente pagar depois, o dinheiro entra na conta e não aparece em lugar nenhum.
- Evidência (conferido): 9 "cancelado" (R$ 313,41, 24/09 a 27/10), todas com a última consulta "ativa, sem pix", nunca
  reconsultadas; 1 "aguardando" desde 28/10 (R$ 29,80).
- Correção: mandar o cancelamento ao Sicoob (`PATCH /cob/{txid}`, status "removida pelo recebedor"); rotina que
  reconsulta as canceladas/aguardando das últimas 24 h; pago depois de cancelado vira aviso "Pix recebido sem venda".
- Esforço: P · Risco: baixo

### [PAG-03] Cancelamento no pinpad acontece antes de conferir se o caixa está aberto
- **Corrigido em 09/11/2026 (Onda 1 da correção).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio**
- Onde: `salao/caixa/tef/tef-lista.tsx:94-101`; `salao/actions.ts:1533-1541` e `:1587-1590`
- O que acontece: o cancelamento vai à adquirente e é confirmado antes de o sistema checar "caixa aberto". Sem caixa
  aberto (ou com queda de conexão nessa hora), o cartão está cancelado e o sistema segue "confirmada", sem estorno no
  caixa. A original é atualizada sem conferir o status (dois registros juntos fariam dois estornos).
- Evidência: em 24/09 um cancelamento teve de ser "registrado à mão: o agente desistiu 7 s antes da resposta chegar".
- Correção: conferir caixa e status no servidor antes do pinpad; guardar o resultado numa fila local até gravar;
  `.eq("status","confirmada")` no update.
- Esforço: P · Risco: baixo

### [PAG-04] Chamadas ao Sicoob sem tempo limite podem travar o "Pagar" da mesma aba
- **Corrigido em 09/11/2026 (Onda 1 da correção).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio** (só com o Sicoob lento)
- Onde: `src/lib/pix.ts:109`, `:182`, `:199`, `:247`; `pix-qr.tsx:64-78` (consulta a cada 3 s, sem esperar a anterior)
- O que acontece: as ações do servidor rodam uma de cada vez por aba (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`).
  Com o Sicoob parado, as consultas fazem fila e o `pagarSelecao` daquela aba espera atrás delas.
- Correção: `AbortSignal.timeout(8000)` nas 4 chamadas; consulta encadeada em vez de `setInterval`.
- Esforço: P · Risco: baixo

### [PAG-05] O sinal de vida do agente TEF nunca chega ao servidor
- **Corrigido em 09/11/2026 (Onda 1 da correção).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: baixo
- Onde: `src/lib/supabase/middleware.ts:75-87` (lista pública tem `/api/impressao/`, `/api/balanca/` e `/api/ponto/`,
  mas não `/api/tef/`, conferido); `agente-tef/agente.mjs:389-402`
- O que acontece: o POST do agente cai no login e o erro é engolido. Não dá pra saber a versão do agente em cada PC,
  justo quando as correções acima dependem de versão nova.
- Evidência: `tef_status` com 0 linhas desde sempre (conferido). Fecha o "conferir" do SEC-19.
- Correção: pôr `/api/tef/` na lista pública (a rota já confere o token) e mostrar versão e "visto há X min" em Cartões (TEF).
- Esforço: P · Risco: baixo

### [PAG-06] Voucher passado como débito vai como "Cartão de débito"
- Severidade: baixo
- Onde: `salao/caixa/pagamentos.tsx:325-350` (a forma vem da escolha do caixa; a bandeira do pinpad não é comparada)
- Evidência: 24 "Lecard Voucher" confirmadas como débito, R$ 1.700,84 (21/10 a 07/11). A NFC-e sai como débito (04)
  e não vale-refeição (11).
- Correção: quando a bandeira indicar voucher, lançar na forma de vale ou perguntar.
- Esforço: P · Risco: baixo

### [PAG-07] Forma "Cartão" sem pinpad continua ligada no PDV e no App, sem aviso
- Severidade: baixo
- Onde: `formas-pagamento/client.tsx`; `src/lib/formas-pagamento.ts:43`, `:100-106`
- Evidência: "Cartão" (tipo `cartao`) ligado no PDV e no App; 1 venda de R$ 32 nele na semana de 02/11, sem TEF.
  Confirma a observação da Etapa 6 no PROGRESSO.
- Correção: aviso no cadastro quando há forma de cartão sem TEF num canal que tem as com TEF.
- Esforço: P · Risco: baixo

### [PAG-08] O agente não confere se a resposta do pinpad é da cobrança que ele mandou
- Severidade: baixo (provável, não provado)
- Onde: `agente-tef/agente.mjs:198-206`; `agente-tef/intpos.mjs:166-204`
- O que acontece: uma resposta atrasada (depois do "tempo esgotado") pode ser lida como da próxima operação.
- Correção: aceitar só se o id e o valor da resposta baterem com o pedido; senão desfazer e registrar.
- Esforço: P · Risco: médio (versão nova do agente)

### [PAG-09] Porta local do agente TEF sem senha; envio grande trava o pinpad até reiniciar
- Severidade: baixo
- Onde: `agente-tef/agente.mjs:294-306`, `:322-324`, `:367-373`
- O que acontece: aceita pedido de qualquer origem (`/venda`, `/cancelar`, `/desfazer`); `/raw` mostra o último
  comprovante; corpo acima de 20 KB deixa `ocupado` preso e tudo responde 409 até reiniciar.
- Correção: aceitar só a origem do sistema e um segredo do config; recusar corpo grande sem travar; tirar o `/raw`.
- Esforço: P · Risco: médio (versão nova do agente)

### [PAG-10] Pix Sicoob: falhas que não deixam rastro
- **Corrigido em parte em 09/11/2026 (Onda 1).** Ver `RELATORIO-FINAL.md`.
- Severidade: baixo
- Onde: `salao/pix-actions.ts:20-28` (insert da cobrança sem conferir erro), `:124` (id novo de devolução a cada
  clique), `:133-139` (valor devolvido lido e gravado por cima)
- O que acontece: QR pago que não aparece em Pix recebidos se o insert falhar; erro ao gerar QR não é gravado; devolução
  parcial pode sair duas vezes se a resposta se perder (0 devoluções até hoje); "aguardando" nunca encerra.
- Correção: conferir o erro; gravar falhas; id da devolução derivado da cobrança; encerrar as vencidas na rotina do PAG-02.
- Esforço: P · Risco: baixo

---

## Agentes dos PCs: impressão, relógio de ponto e balança

### [AGT-01] Balança: pesagem recusada some do sistema, mas o cupom já saiu impresso
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio** (vira **alto** no dia em que o token for trocado, que é parte da correção do SEC-04)
- Onde: `agente-balanca/agente.mjs:442-458` (numera e imprime antes de mandar), `:363-376` (qualquer 4xx vai pra
  `fila-erros.json`, conferido), `:393` (o sinal de vida só conta a fila, não os erros)
- O que acontece: se o sistema responder 401 (token errado) ou 422 (preço não configurado, peso inválido), a pesagem sai
  da fila e vai pra um arquivo no PC. O painel mostra "0 pendentes" e o cliente fica com um cupom cujo número não
  existe no caixa. Trocar o token sem atualizar antes o PC da balança manda as pesagens do dia todas pra esse arquivo.
- Correção: 401/403 = tentar de novo; mandar a contagem de `fila-erros` no sinal de vida e mostrar em `/salao/balanca`;
  no SEC-04, atualizar os PCs antes de trocar o token.
- Esforço: P · Risco: baixo

### [AGT-02] Impressão parada: ninguém fica sabendo, e a comanda velha sai horas depois
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio**
- Onde: o "Agente conectado" só aparece em `(painel)/impressao/page.tsx:23-24`; nenhuma tela mostra a fila; itens sem validade
- Evidência: comanda de cozinha pedida em 14/10 23:35 saiu em 15/10 09:03; em 30/10 das 11:29 às 11:50 (almoço) nada
  imprimiu e 3 comprovantes TEF + 3 NFC-e esperaram até 1.298 s; 07/11 07:50, etiquetas esperaram ~15 min.
- Correção: aviso "agente sem sinal há mais de 2 min" e "item na fila há mais de 1 min" no caixa, PDV e cozinha;
  comanda de cozinha com mais de 1 h pede confirmação antes de imprimir.
- Esforço: P/M · Risco: baixo

### [AGT-03] O agente de impressão pode travar sem cair, e o painel continua dizendo "conectado"
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio** (sem caso comprovado)
- Onde: `agente-impressao/agente.mjs:154` (`print` sem tempo limite), `:106`, `:120`, `:133` (rede sem tempo limite),
  `:101-104` e `:174-178` (o laço só segue quando a rodada termina), `:180-181` (sinal de vida com relógio próprio);
  `bandeja.ps1:171-173` (só religa se o processo morrer)
- Correção: ~30 s no `print` (matar o SumatraPDF) e 15–20 s na rede; o sinal de vida manda a hora da última rodada
  completa e o painel trata como parado se passar de 2 min.
- Esforço: P · Risco: baixo

### [AGT-04] Confirmação de "impresso" perdida faz imprimir em dobro
- **Corrigido em 09/11/2026 (Onda 1 da correção).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio**
- Onde: `agente-impressao/agente.mjs:118-131` (a baixa está dentro do mesmo `try` do ESC/POS, conferido) e `:93-99`
  (`darBaixa` não confere a resposta)
- O que acontece: cupom de NFC-e, TEF ou vale imprime pelo ESC/POS, a baixa falha na rede, o `catch` acha que o ESC/POS
  falhou e imprime de novo pelo PDF; uma 3ª via sai 90 s depois porque o item continua sem baixa. Baixa com erro 500/401
  faz o item voltar em 90 s.
- Evidência: código; o banco não registra tentativas.
- Correção: tirar `darBaixa` do `try` do ESC/POS; conferir `r.ok`; tentar a baixa de novo sem reimprimir.
- Esforço: P · Risco: baixo

### [AGT-05] Falha de impressão repete sem limite e sem registro
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio**
- Onde: `agente-impressao/agente.mjs:112-115`, `:134`, `:157-159` (só no log do PC); `impressao_fila` sem erro nem tentativas
- Evidência: 16/09 08:36 duas etiquetas esperaram ~1.600 s enquanto 44 saíram na mesma impressora; hoje 0 pendentes.
- Correção: colunas `tentativas`/`ultimo_erro`; o agente informa a falha; mostrar na Central; desistir depois de N.
- Esforço: M · Risco: baixo

### [AGT-06] Relógio de ponto: se a leitura falhar, o aviso fica só no log do PC
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: **médio** (a presença do 10% sai das batidas)
- Onde: `agente-impressao/ponto.mjs:47-48`, `:59`, `:83-85`; nada de "última leitura" em `/colaboradores/ponto`
- O que acontece: senha do relógio trocada, relógio fora da rede ou envio recusado: as batidas param de chegar e
  ninguém vê. Não se perdem (continua do último NSR), mas a presença atrasa. O RHiD em paralelo até 20/11 cobre por ora.
- Evidência: atraso normal de 3,4 min (mediana) e 9,9 min (p95).
- Correção: o agente manda o resultado de cada leitura; aviso quando passar de 30 min sem leitura no horário de serviço.
- Esforço: P · Risco: baixo

### [AGT-07] Versões: balança desatualizada, versão da impressão nem é gravada, instalador antigo com o mesmo nome
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: baixo
- Onde: `balanca_status.versao = 1.2.1` (07/11) × 1.2.3 em `agente-balanca/agente.mjs:21`;
  `api/impressao/heartbeat/route.ts:9-17` descarta a versão; `installer/` (1.0.0) e `installer-impressao/` (1.2.0) geram
  os dois `AgenteImpressao-Setup.exe`
- Correção: gravar e mostrar a versão nas duas telas; apagar `installer/`; atualizar a balança.
- Esforço: P · Risco: baixo

### [AGT-08] Os agentes só ligam quando alguém entra no Windows
- Severidade: baixo
- Onde: `installer-impressao/impressao.iss:40`, `installer-balanca/balanca.iss:40` (atalho em `{commonstartup}`)
- O que acontece: PC que reinicia sozinho (atualização, queda de luz) e fica na tela de login fica sem impressão, ponto
  e balança. Os buracos de 15/10 e 07/11 combinam com isso (hipótese).
- Correção: login automático no PC central, ou tarefa agendada "ao iniciar" com reinício.
- Esforço: M · Risco: médio

### [AGT-09] Balança, caminho antigo: reenvio sem id pode duplicar e o código "OFF" não chega ao sistema
- Severidade: baixo (0 casos)
- Onde: `agente-balanca/agente.mjs:462-475`; `api/balanca/pesagem/route.ts:14`, `:75-88`
- Correção: gerar o id também nesse caminho; gravar `codigo_local`.
- Esforço: P · Risco: baixo

### [AGT-10] A nota automática depende do agente de impressão estar ligado
- Severidade: baixo (a nota automática está desligada de propósito, FIS-03)
- Onde: `api/impressao/fila/route.ts:24-32` (emite até 10 NFC-e antes de responder a fila)
- Correção: rotina própria na Vercel para a fila fiscal, separada da impressão.
- Esforço: P · Risco: baixo

### [AGT-11] Segredos e desinstalação nos PCs
- Severidade: baixo
- Onde: `agente-impressao/bandeja.ps1:80-149` (senha do relógio em texto em `C:\ProgramData\AgenteImpressao\relogio.json`,
  pasta que qualquer usuário altera, `impressao.iss:36`); `ponto.mjs:24` (relógio por `http://`); nenhuma ação pra trocar
  o token do agente; `balanca.iss:169-172` procura o `.pid` na pasta errada e a bandeja continua depois de desinstalar
- Correção: proteger o arquivo (DPAPI ou só administrador); botão "gerar novo token" (junto com o SEC-04); corrigir o `.iss`.
- Esforço: P · Risco: baixo

### [AGT-12] O endereço local da balança aceita pedido de qualquer página aberta no PC
- Severidade: baixo
- Onde: `agente-balanca/agente.mjs:402-406` (CORS `*`, conferido), `:432-460`, `:488-516`
- O que acontece: um site aberto naquele PC pode imprimir cupom com valor inventado ou trocar a impressora. No sistema o
  valor é recalculado pelo peso, então o estrago fica no papel.
- Correção: aceitar só a origem do sistema e uma chave local.
- Esforço: P · Risco: baixo

### [AGT-13] Sinal de vida da balança e Central de impressão sem filtro de empresa
- **Corrigido em 10/11/2026 (Onda 3, lote 1).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: baixo (só com a 2ª empresa)
- Onde: `api/balanca/status/route.ts:33-36`; `(painel)/impressao/page.tsx:18-21`
- Correção: `.eq("empresa_id", empresaId)`.
- Esforço: P · Risco: baixo

**Evidência nova para o CX-02:** os 26 pares de comandas da balança com mesmo peso e valor em menos de 60 s (45 dias)
têm 8–53 s entre si, números seguidos e os dois fechados. Não vêm da fila offline do agente; reforça a suspeita de
repesagem no quiosque.

---

## WhatsApp, avisos no celular e apps

A API do WhatsApp está fora desde 14/10 (133010), esperando a Meta. Não é achado; o que interessa é como o sistema se
comporta assim. Desde 14/10: 92 tentativas, 92 falhas, todas com o mesmo erro, nenhuma repetida. Campanhas e gatilhos
nunca foram usados.

### [MSG-01] Campanha pode mandar a mesma mensagem duas vezes
- Severidade: **médio** (latente: nenhuma campanha até hoje)
- Onde: `src/lib/whatsapp-marketing.ts:146-158`, `:73-79`; `api/whatsapp/disparos/route.ts:6` (60 s)
- O que acontece: a rodada lê as linhas "fila" sem reservar, envia e só depois marca "enviada". Rodada cortada no
  limite de 60 s, ou duas rodadas juntas, reenviam. Cada rodada faz até 60 envios com até 10 s de espera cada, e a
  1ª ainda monta a lista de ~3,2 mil clientes.
- Correção: reservar antes de enviar (`for update skip locked`); parar a rodada com ~40 s; montar a lista numa rodada e
  enviar na próxima; "enviando" há mais de 10 min vira "incerta", não reenvio.
- Esforço: M · Risco: baixo

### [MSG-02] Com a API fora, campanha e gatilhos gastam a fila inteira em "falha" e não tentam de novo
- Severidade: **médio** (latente)
- Onde: `whatsapp-marketing.ts:75-78`, `:93`, `:159-160`; função `wpp_candidatos` (exclui `ref` que já existe)
- O que acontece: a rotina só confere se as variáveis existem. Com a Meta recusando, cada rodada queima 60 linhas em
  "falha"; uma campanha de 3,2 mil fecharia "concluída" em ~4,5 h sem ninguém receber. No gatilho, o cliente com "falha"
  nunca mais recebe aquele gatilho. O limite de 250/dia não conta os avisos de pedido.
- Correção: separar erro de conta/token (133010, 190, 131031) de erro do número do cliente; no primeiro erro de conta,
  pausar a campanha e devolver a linha à fila; contar os avisos de pedido no limite.
- Esforço: M · Risco: baixo

### [MSG-03] O app abre qualquer site por dentro, com a ponte nativa ligada
- Severidade: **médio** (por leitura; confirmar no aparelho)
- Onde: `app-entregador/capacitor.config.ts` e `app-equipe/capacitor.config.ts` (`allowNavigation: ["*"]`); botões
  "Mapa" e "WhatsApp" em `src/app/entrega/[token]/entrega-client.tsx:260-261`, `:279-280`
- O que acontece: com `*`, todo `https` abre dentro do app (o Maps web no lugar da tela de entregas), e a página de
  fora ganha acesso à ponte nativa (GPS, câmera, push).
- Correção: `geo:`/`google.navigation:` pro mapa e `whatsapp://send` pro WhatsApp; ou só o domínio guardado fica
  dentro do app. Exige versão nova nas lojas.
- Esforço: M · Risco: médio

### [MSG-04] O GPS em segundo plano para em silêncio depois de cada publicação
- Severidade: **médio** (latente: nenhuma posição desde 14/10)
- Onde: `entrega-client.tsx:167-170` (posição por ação do servidor com `.catch(() => {})`)
- O que acontece: depois de publicar versão nova, o app aberto no bolso chama a ação velha, o servidor não reconhece e o
  erro é engolido; o mapa do painel fica parado até o entregador mexer no app. Sem internet a posição se perde.
- Correção: mandar a posição por uma rota `/api/entrega/posicao`, que não depende da versão; ou recarregar ao detectar
  versão velha.
- Esforço: P · Risco: baixo

### [MSG-05] Aviso de WhatsApp que falha não aparece em lugar nenhum
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: baixo
- Onde: `src/lib/whatsapp.ts:77-80`, `:155`; nenhuma tela lê `whatsapp_mensagens`
- Correção: faixa no delivery quando as últimas saídas falharam por conta/token; contador de não entregues.
- Esforço: P · Risco: baixo

### [MSG-06] Pedido do convênio (Kern) dispara "saiu" e "entregue" no WhatsApp
- Severidade: baixo (decisão do Rafael)
- Onde: `whatsapp.ts:126-156` (não olha a origem)
- Evidência: 90 das 92 tentativas desde 14/10 foram de pedidos do convênio, pra 3 telefones.
- Correção: se não for desejado, pular quando `origem='convenio'` (ou opção no convênio).
- Esforço: P · Risco: baixo

### [MSG-07] Mudar o status do pedido espera a Meta antes de fechar a comanda
- Severidade: baixo
- Onde: `delivery/actions.ts:63-73`; `entrega/[token]/entrega-actions.ts:195`; espera de 10 s em `whatsapp.ts:73`
- Correção: `after(() => avisarPedido(...))`, como os avisos no celular já fazem.
- Esforço: P · Risco: baixo

### [MSG-08] Webhook: "cancelar" descadastra das promoções, mensagem repetida duplica, status pode voltar atrás
- Severidade: baixo
- Onde: `api/whatsapp/webhook/route.ts:15`, `:61-63`, `:88-96`; índice `idx_wpp_msg_wa` não é único
- Correção: tirar "cancelar" da lista; índice único parcial em `wa_id`; status só avança; resposta do "SAIR" com `after()`.
- Esforço: P · Risco: baixo

### [MSG-09] Avisos no celular: sem registro, sem trava e sem tempo limite
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: baixo
- Onde: `src/lib/push.ts:41`, `:66`, `:82`; `src/lib/push-avisos.ts:168-198`
- O que acontece: não dá pra saber se o resumo das 08:00 saiu; disparo repetido manda 2x; `fetch` sem tempo limite;
  token inválido com erro 400 provavelmente não é limpo (só o 404).
- Correção: tabela `push_envios` com uma linha por dia do resumo; `AbortSignal.timeout(8000)`; regra de limpeza
  `UNREGISTERED`/"not a valid FCM registration token".
- Esforço: P · Risco: baixo

### [MSG-10] Sem internet ao abrir, o app fica na tela de erro do Android
- Severidade: baixo
- Onde: `app-entregador/www/index.html:130-131` (igual no `app-equipe`); sem `server.errorPath`
- Correção: testar a `/identidade` antes; "Sem internet · Tentar de novo". Exige versão nova nas lojas.
- Esforço: P · Risco: baixo

---

## Rotinas automáticas e serviços de fora

Continuam abertos, sem repetir: MAR-03 (Kern em dobro com rotina + botão juntos), MAR-04, MAR-05 (rotinas falham caladas;
a Vercel não repete rotina que falhou, e só a SEFAZ grava sinal de que rodou).

### [CRN-01] Se o Google falhar, o cliente lê "endereço não encontrado" e não consegue pedir
- Severidade: **médio** (quase sem uso hoje; vale quando o delivery próprio ligar)
- Onde: `src/lib/geo.ts:20-24`, `:48-52`; `src/lib/delivery-core.ts:155-156`; `src/app/pedir/actions.ts:246-247`
- O que acontece: `fetch` sem tempo limite e sem conferir o status; recusa do Google (cota, cobrança, chave) vira
  "Não encontrei esse endereço no mapa" e o pedido de entrega é recusado. O Nominatim só entra quando não há chave.
- Correção: `AbortSignal.timeout(5000)`, conferir `status`; fora de `ZERO_RESULTS`, tentar o Nominatim; mensagem
  "o mapa não respondeu, tente de novo".
- Esforço: P · Risco: baixo

### [CRN-02] O cálculo da taxa é público, sem limite e sem guardar resultado: cada clique é uma chamada paga ao Google
- Severidade: baixo hoje; médio com o delivery ligado
- Onde: `src/app/pedir/actions.ts:18-24` (`calcularEntregaPublico`, sem login); `pedir-client.tsx:340`
- Correção: já: teto de cota/gasto no Google Cloud. Depois: guardar o resultado por endereço e limitar por IP.
- Esforço: P · Risco: baixo

### [CRN-03] TV: se a temperatura demorar, a atualização completa da TV falha
- Severidade: baixo
- Onde: `src/app/tv/tv-client.tsx:57` (desiste em 4 s); `src/lib/rodizio-server.ts:109` (espera o Open-Meteo até 4 s);
  `api/tv/fila/route.ts:33-35`; `tv/page.tsx:77`
- O que acontece: com o Open-Meteo lento, cardápio, recados e feriados ficam parados na TV (a fila continua certa).
- Correção: devolver sempre a temperatura guardada e atualizar em segundo plano; 8 s pra consulta completa.
- Esforço: P · Risco: baixo

### [CRN-04] Contagem agendada sai até 14 min atrasada, e entre 23:46 e 23:59 nunca sai
- Severidade: baixo
- Onde: `supabase/migrations/0216_funcoes_antigas_sem_anonimo.sql:162-172`; `contagens/agendamentos/form.tsx:226`
- Evidência: o agendamento das 21:17 saiu em média 13,8 min depois (9 vezes). Nenhum agendado entre 23:46 e 23:59 hoje.
- Correção: campo de 15 em 15 min ou aviso; não aceitar depois das 23:45.
- Esforço: P · Risco: baixo

### [CRN-05] A rotina das contagens e o aviso da manhã não têm trava contra rodar 2 vezes
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Severidade: baixo (0 casos)
- Onde: `0216:169-180`; `push-avisos.ts:67-97`
- Correção: marcar o dia antes de gerar só se ainda não marcado, e pular se não marcou.
- Esforço: P · Risco: baixo

### [CRN-06] As duas rotinas da SEFAZ disparam juntas no minuto :00
- **Corrigido em 09/11/2026 (Onda 2, Saúde do sistema).** Ver `RELATORIO-FINAL.md`, seção "Andamento das correções".
- Ver NFE-05 (mesma correção: mudar a `sefaz/cron` pra `3 * * * *`).

### [CRN-07] App das marmitas: quando a API falha, mostra "abrem às undefined" ou fica mudo
- Severidade: baixo
- Onde: `public/marmitas.html:426-439`; `api/marmitas/[[...rota]]/route.ts:558-563` (500 mostra o erro interno do banco)
- Correção: conferir `r.ok`; "Sem conexão, tentar de novo"; mensagem genérica no 500.
- Esforço: P · Risco: baixo

### [CRN-08] O horário-limite das marmitas é editável, mas a rotina do Kern é fixa às 08:35
- Severidade: baixo (hoje 08:30 e bloqueio ligado)
- Onde: `public/marmitas.html:920`; `vercel.json`; `api/kern/delivery/route.ts:8-10`
- Correção: limitar o horário a 08:30 com aviso, ou a rotina ler o limite.
- Esforço: P · Risco: baixo

### [CRN-09] Site: envio da reserva sem tempo limite; cardápio que não carregou aparece como "não publicado"
- Severidade: baixo
- Onde: `public/site/index.html:964`, `:778`
- Correção: 10 s no envio e depois WhatsApp; texto próprio pra "não carregou".
- Esforço: P · Risco: baixo

Mais um ponto, sem número: o código usa −03:00 fixo (`kern-delivery.ts:40`, `api/cardapio/route.ts:15`). Se o horário
de verão voltar, tudo desloca 1 h.

---

## Verificado e OK (resumo)

- **Nota fiscal:** série 11 sem número repetido; fila 2.763 emitidas, nada preso; 0 comandas com duas notas; 5
  recusas em 30 dias (CPF inválido 2×, limite da Focus, homologação, série antiga); hora da nota em Brasília;
  contingência impressa no cupom; certificado não vai pro navegador.
- **SEFAZ:** tempo limite de 45 s; NSU gravado a cada página (7.070, coerente); 0 notas/itens duplicados.
- **Pix Sicoob:** txid aleatório de 32; só conta pago quando o banco lista Pix que somam o valor; 207 pagas, 207 casam
  com o caixa; token guardado até 30 s antes de vencer.
- **Pinpad:** uma operação por vez; confirma só depois de gravar a venda; 0 aprovadas penduradas; 0 confirmadas sem
  movimento; mediana 3,9 s até fechar (DES-010 valendo); Pix no pinpad passa pela mesma guarda.
- **Impressão:** 0 pendentes de 7.934; mediana 3–4 s (18 s marmita); reserva de 90 s impede duas rodadas no mesmo item;
  token dos agentes nunca foi pro git.
- **Ponto:** NSR 1 a 2.985 sem buraco; gravação idempotente; 77 de 77 batidas das últimas 2 semanas ligadas a alguém.
- **Balança:** envio idempotente por id; 0 números repetidos no dia (45 dias); reabre a serial sozinha.
- **WhatsApp:** assinatura do webhook conferida com comparação segura; aviso de pedido vai uma vez por evento;
  descadastro e aniversário respeitam a escolha do cliente.
- **Avisos no celular:** registro usa a chave de acesso nova (SEC-05); token 404 apagado; avisos do painel em `after()`.
- **Apps:** entrada só `https` com `/identidade`; GPS no máximo 1 posição a cada 15 s; limpeza de 90 dias certa
  (primeira faxina real ~12/12).
- **Extensão do Chrome:** só `web.whatsapp.com`, o domínio do sistema e localhost; sem `externally_connectable`.
- **Rotinas:** horário UTC → Brasília certo nas 7; Kern 76 de 76 dias certos, índice único, nada em feriado; tempo
  máximo de 60 s nas de 5 em 5 min (não se sobrepõem); BrasilAPI e Open-Meteo com tempo limite e plano B.
- **TV:** canal privado; sem Realtime continua (fila 30 s, resto 5 min); modo simples sem JavaScript.

## Não deu pra verificar por leitura

- Extratos da Bin (PAG-01) e do Sicoob (PAG-02); painel da Focus (NFE-01: 62 contingências e os 61 números inutilizados;
  o nº 76 pulado em 10/09).
- Se já houve 656 de verdade (nada é gravado; só nos logs da Vercel).
- Validade do certificado A1 (não lido, por regra).
- Logs dos PCs (`agente.log`, `fila-erros.json`, `estado.json`) e a causa do buraco de 21 min em 30/10.
- Comportamento do Elgin Hub com resposta atrasada (PAG-08) e do app no aparelho (MSG-03, MSG-04).
- Firebase/APNs dos 2 iPhones; token e qualidade do número na Meta.
- Restrições e cota das chaves no Google Cloud; tempo máximo real das rotinas sem `maxDuration`.
