@AGENTS.md

# Layout do painel (out/2026)

Protótipo aprovado em `docs/referencia-layout/` (painel claro, painel escuro e
pedidos do delivery); prints da implementação em `docs/referencia-layout/prints/`.
Tudo que for criado daqui pra frente nasce neste padrão.

## Paleta — só por token, nunca cor escrita na tela

A paleta mora em `src/lib/paleta.ts` (a mesma lista está como reserva no
`globals.css`). A cor da empresa vem do cadastro (`empresas.cor_primaria`) e a
paleta inteira gira pro tom dela; com o laranja do Brasa sai exatamente:

| Papel | Token / classe | Claro | Escuro |
|---|---|---|---|
| Marca / botão principal | `--marca-primaria` · `bg-primaria` | #E57A2C | #E57A2C |
| Texto sobre a marca | `--marca-sobre-primaria` · `text-marca-sobre-primaria` | #1C120C | #140D09 |
| Texto laranja (link, destaque) | `--texto-marca` · `text-texto-marca` (= `orange-600`) | #B44D14 | #FFB25E |
| Texto laranja sobre pêssego | `text-texto-marca-pilula` | #A3440F | #FFB25E |
| Fundo da página | `bg-painel-fundo` | #FFF8EF | #140D09 |
| Superfície (cartão) | `bg-painel-cartao` | #FFFFFF | #1F1611 |
| Superfície 2 (blocos, mesa livre) | `bg-superficie-suave` | #FBF2E8 | #2A1E17 |
| Destaque suave (pêssego) | `bg-destaque` | #FFE7D1 | rgba(229,122,44,.16) |
| Linha / contorno | `border-borda` | #F1E2D2 | #3A2A20 |
| Texto forte / médio / fraco | `text-texto` / `-suave` / `-fraco` | #1C120C / #6E635B / #7A6A5D | #FFF6EC / #B8A595 / #9C8878 |
| Sucesso (etiqueta) | `pilula-ok` | #D9F2E2 + #1E7A43 | rgba(63,217,140,.14) + #5FE3A1 |
| Erro / urgente | `pilula-urgente` · sólido `pilula-urgente-solido` | #FDE1DA + #B42A18 · #D63A22 | rgba(255,116,72,.16) + #FF8A66 · #FF7448 |
| Informação (na rua) | `pilula-info` | #E3ECFB + #2B58A8 | rgba(98,150,255,.16) + #8FB4FF |

- Texto sobre o botão laranja é SEMPRE grafite, nunca branco (branco dá 3,3:1).
- Texto laranja sobre fundo claro só no tom `texto-marca` (#B44D14).
- O cinza `zinc-*` do Tailwind já é o cinza quente; `orange-*` segue a marca.
- Impressão (cupom, nota, PDF, etiqueta) continua em fundo claro e cores fixas.

## Linguagem visual — peças prontas no `globals.css`

- **Cartão** `.cartao`: sem borda, raio 20, sombra quente (no escuro, contorno
  interno + sombra escura).
- **Raios**: `rounded-cartao` 20 · `rounded-controle` 14 (botão, campo, busca) ·
  `rounded-mesa` 10 (quadradinho de mesa) · `rounded-full` (etiqueta, filtro,
  contador). Não usar rounded-lg / xl / 2xl.
- **Botão principal** `.btn-principal`: laranja, letra grafite em negrito, 46px,
  brilho laranja embaixo. **Secundário** `.btn-secundario`: superfície com a
  sombra do cartão. Dentro do cartão de foco: `.btn-foco`.
- **Rótulo** `.rotulo`: maiúsculas, 11px, espaçamento 0.1em, texto fraco.
- **Número grande** `.numero-grande` / `font-numero`: Space Grotesk 700, −0.03em.
- **Etiqueta** `.pilula` (pêssego) · `pilula-urgente` · `pilula-ok` · `pilula-info`
  · `pilula-neutra` · `pilula-grafite` · `pilula-urgente-solido`.
- **Bloco de número**: o mais importante do grupo em `bg-destaque` (pêssego), os
  outros em `bg-painel-fundo`/`bg-superficie-suave`.
- **Cartão de foco** `.cartao-foco`: UM por tela, invertido (grafite no claro,
  creme no escuro), rótulo em `text-painel-foco-rotulo`, valor grande e as ações
  principais da tela.
- **Laranja forte** só no botão principal, no item ativo do menu, nas mesas
  ocupadas e no destaque de gráfico. O resto do destaque é pêssego.
- **Filtros** em pílula com contador: ativo em grafite com contador laranja; os
  outros brancos com sombra; contador vermelho quando pede atenção.
- **Listas** dentro de um cartão, cabeçalho em `.rotulo`, valores à direita em
  `font-numero`, informação secundária como segunda linha da célula principal,
  linha selecionada em pêssego com contorno laranja.
- **Tipografia**: Space Grotesk (número, valor, título) e Instrument Sans
  (interface). A escolha mora em `--fonte-interface`/`--fonte-numero`.
- **Acessibilidade**: alvo de toque ≥ 44px, foco visível (regra global, nunca
  `outline-none`), contraste ≥ 4,5:1 em texto nos dois temas.
