"use client";

import { useSyncExternalStore } from "react";

// CABER NA TELA, SEJA QUAL FOR A TV
//
// Uma TV não rola: o que não coube, não existe. E "tamanho certo" não existe em
// número fixo — a mesma letra que se lê bem numa tela de 50" some numa de 32".
//
// Então o mural é desenhado sempre numa folha de mentira, com a MESMA PROPORÇÃO
// da TV que estiver ali, e depois a folha inteira é ampliada até encostar nas
// bordas. É o que se faz com um cartaz: desenha num tamanho só e imprime
// conforme a parede. Assim o mural ocupa a tela inteira em qualquer TV, e a
// letra sai do maior tamanho que aquela tela aguenta.
const LARGURA = 1120;

/** O tamanho da janela como um texto — texto igual é texto igual, então o React
 *  só refaz a conta quando a janela muda de verdade. */
function lerTela() {
  return `${window.innerWidth}x${window.innerHeight}`;
}

/** No servidor não existe janela. Vale uma tela de TV comum; o navegador
 *  corrige na primeira pintura. */
const NO_SERVIDOR = "1920x1080";

function assinar(avisar: () => void) {
  window.addEventListener("resize", avisar);
  return () => window.removeEventListener("resize", avisar);
}

export function Ajustar({ ajuste = 1, children }: { ajuste?: number; children: React.ReactNode }) {
  const tela = useSyncExternalStore(assinar, lerTela, () => NO_SERVIDOR);
  const [largura, altura] = tela.split("x").map(Number);

  return (
    <div className="fixed inset-0 overflow-hidden bg-painel-fundo">
      <div
        style={{
          width: LARGURA,
          height: (LARGURA * altura) / largura,
          transform: `scale(${(largura / LARGURA) * ajuste})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
