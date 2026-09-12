// Tela de descanso da TV da cozinha: relógio grande + data + temperatura e o
// painel de recados. Sem hooks de propósito — é desenhada tanto no servidor
// (modo simples) quanto no navegador (modo normal).

export type RecadoTv = { id: string; texto: string };

const DIAS = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Partes da data em horário de Brasília (o servidor roda em UTC).
function partesSP(agora: number) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", hour12: false,
    weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(agora));
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  return { hora: g("hour").replace("24", "00"), min: g("minute"), seg: g("second"), dia: Number(g("day")), mes: Number(g("month")), ano: g("year"), dow: dow < 0 ? 0 : dow };
}

export function TvRelogio({ agora, recados, temperatura, piscar = true }: { agora: number; recados: RecadoTv[]; temperatura: number | null; piscar?: boolean }) {
  const p = partesSP(agora);
  const doisPontos = piscar && Number(p.seg) % 2 === 1 ? " " : ":";
  const temRecado = recados.length > 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: temRecado ? "flex-start" : "center", padding: temRecado ? "28px 32px 0" : "0 32px" }}>
      {/* hora */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
        <div style={{ fontSize: temRecado ? 150 : 220, lineHeight: 1, fontWeight: 900, letterSpacing: "0.02em", color: "#fff", fontVariantNumeric: "tabular-nums" }}>
          {p.hora}<span style={{ color: "#C78340" }}>{doisPontos}</span>{p.min}
        </div>
        {temperatura != null && (
          <div style={{ fontSize: temRecado ? 44 : 64, fontWeight: 800, color: "#bbb" }}>{Math.round(temperatura)}°C</div>
        )}
      </div>
      {/* data */}
      <div style={{ marginTop: temRecado ? 6 : 14, fontSize: temRecado ? 30 : 42, fontWeight: 800, letterSpacing: "0.12em", color: "#C78340" }}>{DIAS[p.dow]}</div>
      <div style={{ marginTop: 4, fontSize: temRecado ? 26 : 34, fontWeight: 600, color: "#aaa" }}>
        {p.dia} de {MESES[p.mes - 1]} de {p.ano}
      </div>

      {/* recados */}
      {temRecado && (
        <div style={{ width: "100%", maxWidth: 1400, marginTop: 28, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.16em", color: "#777" }}>RECADOS</div>
          {recados.slice(0, 5).map((r) => (
            <div key={r.id} style={{ background: "#3a2410", borderLeft: "14px solid #C78340", borderRadius: 16, padding: "18px 24px", fontSize: recados.length > 3 ? 30 : 38, lineHeight: 1.2, fontWeight: 800, color: "#fff", overflowWrap: "anywhere" }}>
              {r.texto}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
