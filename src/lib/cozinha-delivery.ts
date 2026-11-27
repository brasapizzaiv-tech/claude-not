// Pedidos do delivery no tablet da cozinha (KDS, pedido do Rafael 27/11/2026).
// Sem dependência de servidor: o tablet usa pra desenhar o cartão.
//
// O que a cozinha vê: o pedido que JÁ foi pra cozinha (aceito e impresso, ou
// em preparo), com os itens do jeito que saem no papel, e um botão "Pronto".
// O agendado que ainda não foi liberado (almoço 10:30, noite 18:00) aparece à
// parte, como "mais tarde", pra cozinha saber o que vem.

export type PedidoCozinha = {
  id: string;
  numero: number | null;
  nome: string;
  tipo: "entrega" | "retirada";
  status: "aceito" | "em_preparo" | "pronto";
  /** Já está na cozinha (impresso). Falso = agendado guardado pra mais tarde. */
  naCozinha: boolean;
  agendado_para: string | null;
  previsao_em: string | null;
  /** Desde quando está na cozinha (preparo, aceite ou criação). */
  desde: string;
  pronto_em: string | null;
  observacao: string | null;
  itens: { qtd: number; descricao: string }[];
};

/** "Pronto" fica na tela um pouco (pra dar pra desfazer o toque errado). */
export const DELIVERY_PRONTO_SOME_SEG = 120;
/** Na cozinha há mais que isso sem previsão: o cartão avisa. */
export const DELIVERY_ALERTA_MIN = 35;

export type LinhaItem =
  | { tipo: "etapa"; texto: string }
  | { tipo: "escolha"; texto: string }
  | { tipo: "obs"; texto: string };

/** Quebra a descrição do item (a mesma da comanda impressa) em partes:
 *  1ª linha = nome; "» Título" = etapa do combo; "- escolha"; "Obs: ...".
 *  Tira o preço das escolhas ("Pudim (+4)") — na cozinha não interessa. */
export function partesDoItem(descricao: string): { nome: string; sabores: string | null; linhas: LinhaItem[] } {
  const [primeira = "", ...resto] = String(descricao || "").split("\n");
  const semPreco = (s: string) => s.replace(/\s*\(\+\s*R?\$?\s*[\d.,]+\)\s*$/, "").trim();
  // Pizza avulsa vem numa linha só: "Pizza Grande 35cm — A / B / C".
  let nome = primeira.trim();
  let sabores: string | null = null;
  const traco = nome.indexOf(" — ");
  if (traco > 0) { sabores = nome.slice(traco + 3).trim(); nome = nome.slice(0, traco).trim(); }
  const linhas: LinhaItem[] = [];
  for (const bruta of resto) {
    const l = bruta.trim();
    if (!l) continue;
    if (l.startsWith("»")) linhas.push({ tipo: "etapa", texto: l.replace(/^»\s*/, "") });
    else if (/^(obs|📝)/i.test(l)) linhas.push({ tipo: "obs", texto: l.replace(/^(📝\s*)?obs\.?:?\s*/i, "") });
    else linhas.push({ tipo: "escolha", texto: semPreco(l.replace(/^[-•]\s*/, "")) });
  }
  return { nome, sabores, linhas };
}

/** O que mostrar: na cozinha + prontos recentes; agendados à parte. */
export function separarDelivery(pedidos: PedidoCozinha[], agora = Date.now()) {
  const visivel = (p: PedidoCozinha) =>
    p.status !== "pronto" || (!!p.pronto_em && agora - Date.parse(p.pronto_em) < DELIVERY_PRONTO_SOME_SEG * 1000);
  const porNumero = (a: PedidoCozinha, b: PedidoCozinha) =>
    (a.numero ?? 1e9) - (b.numero ?? 1e9) || a.desde.localeCompare(b.desde);
  return {
    cozinha: pedidos.filter((p) => (p.naCozinha || p.status === "pronto") && visivel(p)).sort(porNumero),
    depois: pedidos
      .filter((p) => !p.naCozinha && p.status !== "pronto")
      .sort((a, b) => (a.agendado_para ?? "").localeCompare(b.agendado_para ?? "")),
  };
}

/** Hora marcada (agendado) ou a previsão; e se já passou. */
export function horaAlvo(p: PedidoCozinha): string | null {
  return p.agendado_para ?? p.previsao_em ?? null;
}
