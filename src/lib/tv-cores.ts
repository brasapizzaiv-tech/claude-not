// A CARA DAS TELAS DE TV
//
// As TVs não usam a folha de estilo do sistema: o aparelho da cozinha e o do
// escritório não rodam o CSS moderno em que o painel é escrito, então lá tudo
// vai em estilo colado no elemento. Este arquivo é o que sobra de "sistema de
// cores" pra elas — um lugar só, pra as duas telas não irem cada uma pro seu
// lado.
//
// A base é o grafite da marca, o mesmo do painel, e não o preto puro de antes:
// num salão com luz forte o preto puro vira um buraco na parede, e o grafite
// segura melhor o laranja.
export const TV = {
  fundo: "#140d09",   // grafite da marca (paleta escura do layout novo, out/2026)
  bloco: "#1f1611",   // as caixas em cima do fundo
  borda: "#3a2a20",   // contorno e divisórias
  texto: "#fff6ec",   // o que se lê de longe
  suave: "#b8a595",   // segunda linha
  fraco: "#9c8878",   // rótulo, legenda
  laranja: "#E57A2C", // a marca — o acento principal
  areia: "#e0bd85",   // marmitas
  verde: "#9dbd7c",   // saladas
  atencao: "#ff8a66", // pontos de atenção
  atencaoFundo: "#3a1a12",
  recadoFundo: "#3a2712",
  rosa: "#e0919c",    // doces, no quadro do rodízio
} as const;
