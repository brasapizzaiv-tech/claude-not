// Tela de descanso da TV da cozinha: relógio grande + data + temperatura e o
// painel de recados. Sem hooks de propósito — é desenhada tanto no servidor
// (modo simples) quanto no navegador (modo normal).

export type RecadoTv = { id: string; texto: string };
export type AniversarianteTv = { nome: string; dia: number; hoje: boolean };

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

export function TvRelogio({ agora, recados, temperatura, aniversariantes = [], piscar = true }: { agora: number; recados: RecadoTv[]; temperatura: number | null; aniversariantes?: AniversarianteTv[]; piscar?: boolean }) {
  const p = partesSP(agora);
  const apagado = piscar && Number(p.seg) % 2 === 1; // dois pontos piscam sem mexer na largura
  const temRecado = recados.length > 0 || aniversariantes.length > 0;
  const niverHoje = aniversariantes.filter((a) => a.hoje);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: temRecado ? "flex-start" : "center", padding: temRecado ? "28px 32px 0" : "0 32px" }}>
      {/* hora */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
        <div style={{ fontSize: temRecado ? 150 : 220, lineHeight: 1, fontWeight: 900, letterSpacing: "0.02em", color: "#fff", fontVariantNumeric: "tabular-nums" }}>
          {p.hora}<span style={{ color: "#C78340", visibility: apagado ? "hidden" : "visible" }}>:</span>{p.min}
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

      {/* aniversariantes do mês (quem faz hoje ganha destaque) */}
      {aniversariantes.length > 0 && (
        <div style={{ width: "100%", maxWidth: 1400, marginTop: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.16em", color: "#777" }}>
            🎂 ANIVERSARIANTES DE {MESES[p.mes - 1].toUpperCase()}
          </div>
          {niverHoje.length > 0 && (
            <div style={{ marginTop: 10, background: "#C78340", borderRadius: 16, padding: "14px 24px", fontSize: 40, fontWeight: 900, color: "#fff" }}>
              🎉 HOJE: {niverHoje.map((a) => a.nome).join(", ")} — parabéns!
            </div>
          )}
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10 }}>
            {aniversariantes.filter((a) => !a.hoje).map((a) => (
              <div key={a.nome + a.dia} style={{ background: "#1c1c1c", border: "2px solid #3a2410", borderRadius: 12, padding: "8px 16px", fontSize: 26, fontWeight: 700, color: "#eee" }}>
                <span style={{ color: "#C78340", fontVariantNumeric: "tabular-nums" }}>{String(a.dia).padStart(2, "0")}</span> {a.nome}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* recados */}
      {recados.length > 0 && (
        <div style={{ width: "100%", maxWidth: 1400, marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
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
