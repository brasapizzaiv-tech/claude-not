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
  fundo: "#211915",   // grafite da marca
  bloco: "#2b211b",   // as caixas em cima do fundo
  borda: "#3d2f26",   // contorno e divisórias
  texto: "#f4ece4",   // o que se lê de longe
  suave: "#c9b6a5",   // segunda linha
  fraco: "#9b8878",   // rótulo, legenda
  laranja: "#C78340", // a marca — o acento principal
  areia: "#e0bd85",   // marmitas
  verde: "#9dbd7c",   // saladas
  atencao: "#e8836c", // pontos de atenção
  atencaoFundo: "#3a1d18",
  recadoFundo: "#3a2712",
  rosa: "#e0919c",    // doces, no quadro do rodízio
} as const;
