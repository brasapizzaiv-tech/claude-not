"use client";

// Card de um pedido do rodízio — o mesmo desenho na TV (só leitura) e no
// tablet da cozinha (com botões). Feito pra ser lido de longe: mesa e sabor
// grandes, selo colorido da fração, tempo de espera.
import { FRACAO_ROTULO, STATUS_COR, ESPERA_ALERTA_MIN, minutosDesde, tempoEspera, type PedidoRodizio } from "@/lib/rodizio";

export function RodizioCard({
  p,
  agora,
  escala = 1,
  acoes,
}: {
  p: PedidoRodizio;
  agora: number;
  escala?: number;          // 1 = TV; 0.85 = tablet (mais cards na tela)
  acoes?: React.ReactNode;  // botões do tablet
}) {
  const cor = STATUS_COR[p.status];
  const esperaMin = minutosDesde(p.criado_em, agora);
  const atrasado = p.status === "pendente" && esperaMin >= ESPERA_ALERTA_MIN;
  const px = (n: number) => `${Math.round(n * escala)}px`;
  // Nome do sabor NUNCA abreviado: nome comprido só diminui a letra e quebra
  // em quantas linhas precisar ("Bacon com Cebola Caramelizada" tem que caber).
  const nome = p.sabor.trim();
  const tamSabor = nome.length > 30 ? 24 : nome.length > 20 ? 28 : 34;

  return (
    <div
      style={{
        background: cor.fundo,
        borderLeft: `${px(14)} solid ${cor.borda}`,
        borderRadius: px(16),
        padding: `${px(14)} ${px(18)}`,
        display: "flex",
        alignItems: "center",
        gap: px(18),
        minHeight: px(96),
        boxShadow: atrasado ? "0 0 0 3px #ef4444 inset" : undefined,
      }}
    >
      {/* mesa */}
      <div style={{ textAlign: "center", minWidth: px(96) }}>
        <div style={{ fontSize: px(14), letterSpacing: "0.15em", color: cor.texto, opacity: 0.8, fontWeight: 700 }}>MESA</div>
        <div style={{ fontSize: px(56), lineHeight: 1, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{p.mesa}</div>
      </div>

      {/* sabor + detalhes */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: px(10), flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: px(13),
              fontWeight: 900,
              letterSpacing: "0.08em",
              padding: `${px(3)} ${px(10)}`,
              borderRadius: px(8),
              background: p.fracao === "inteira" ? "#fff" : p.fracao === "meia" ? "#facc15" : "#f472b6",
              color: "#111",
            }}
          >
            {FRACAO_ROTULO[p.fracao]}
          </span>
          {p.quantidade > 1 && (
            <span style={{ fontSize: px(22), fontWeight: 900, color: "#fff" }}>{p.quantidade}×</span>
          )}
          <span style={{ fontSize: px(12), fontWeight: 700, color: cor.borda, letterSpacing: "0.1em" }}>{cor.rotulo}</span>
        </div>
        <div
          style={{
            fontSize: px(tamSabor),
            lineHeight: 1.1,
            fontWeight: 900,
            color: "#fff",
            marginTop: px(4),
            overflowWrap: "anywhere",
          }}
        >
          {nome}
        </div>
        {p.observacao && (
          <div style={{ fontSize: px(20), color: "#fde68a", fontWeight: 700, marginTop: px(2) }}>⚠ {p.observacao}</div>
        )}
      </div>

      {/* tempo */}
      <div style={{ textAlign: "right", minWidth: px(100), flexShrink: 0 }}>
        <div
          style={{
            fontSize: px(26),
            fontWeight: 900,
            color: atrasado ? "#ef4444" : cor.texto,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {p.status === "pronto" ? "✓" : tempoEspera(p.criado_em, agora)}
        </div>
        {p.garcom && <div style={{ fontSize: px(13), color: cor.texto, opacity: 0.7 }}>{p.garcom.split(" ")[0]}</div>}
      </div>

      {acoes}
    </div>
  );
}
