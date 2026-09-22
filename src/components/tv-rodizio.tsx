import { RodizioCard } from "@/components/rodizio-card";
import { TV } from "@/lib/tv-cores";
import { CARDS_POR_COLUNA, type PedidoRodizio } from "@/lib/rodizio";

// O QUADRO DE PEDIDOS DO RODÍZIO
//
// Um arquivo só, usado pelas duas versões da TV (a que atualiza sozinha pelo
// navegador e a simples, que recarrega a página inteira): antes o mesmo quadro
// estava escrito duas vezes, e mudar uma e esquecer a outra era questão de
// tempo.
//
// A divisão SALGADAS | DOCES existe porque são dois fornos e duas pessoas. Mas
// na maior parte da noite só um lado tem pedido — e aí metade da TV ficava
// preta enquanto o outro lado espremia seis cartões. Agora, quando só um tipo
// tem fila, ele toma a tela toda e se abre em duas colunas de cartões: cabe o
// dobro, com a letra do mesmo tamanho.

export function QuadroRodizio({
  salgadas,
  doces,
  agora,
}: {
  salgadas: PedidoRodizio[];
  doces: PedidoRodizio[];
  agora: number;
}) {
  const soSalgadas = doces.length === 0;
  const soDoces = salgadas.length === 0;

  if (soSalgadas || soDoces) {
    const lista = soDoces ? doces : salgadas;
    return (
      <div style={{ flex: 1, minHeight: 0, padding: "20px 24px 0" }}>
        <Coluna
          titulo={soDoces ? "DOCES" : "SALGADAS"}
          cor={soDoces ? TV.rosa : TV.laranja}
          lista={lista}
          agora={agora}
          cabem={CARDS_POR_COLUNA * 2}
          duasColunas
        />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 24, padding: "20px 24px 0" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Coluna titulo="SALGADAS" cor={TV.laranja} lista={salgadas} agora={agora} cabem={CARDS_POR_COLUNA} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Coluna titulo="DOCES" cor={TV.rosa} lista={doces} agora={agora} cabem={CARDS_POR_COLUNA} />
      </div>
    </div>
  );
}

function Coluna({
  titulo,
  cor,
  lista,
  agora,
  cabem,
  duasColunas = false,
}: {
  titulo: string;
  cor: string;
  lista: PedidoRodizio[];
  agora: number;
  cabem: number;
  duasColunas?: boolean;
}) {
  const visiveis = lista.slice(0, cabem);
  const resto = lista.length - visiveis.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: "2.8vh", fontWeight: 900, letterSpacing: "0.12em", color: cor }}>{titulo}</span>
        <span style={{ fontSize: "2.1vh", fontWeight: 700, color: TV.fraco }}>{lista.length}</span>
      </div>
      <div
        style={
          duasColunas
            ? { display: "flex", flexWrap: "wrap", gap: 12, alignContent: "flex-start" }
            : { display: "flex", flexDirection: "column", gap: 12 }
        }
      >
        {visiveis.map((p) => (
          <div key={p.id} style={duasColunas ? { width: "calc(50% - 6px)" } : undefined}>
            <RodizioCard p={p} agora={agora} tv />
          </div>
        ))}
      </div>
      {resto > 0 && (
        <div style={{ marginTop: 12, textAlign: "center", fontSize: "2.4vh", fontWeight: 800, color: cor }}>
          +{resto} na fila
        </div>
      )}
    </div>
  );
}
