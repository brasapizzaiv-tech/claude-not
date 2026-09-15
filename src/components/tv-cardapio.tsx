// Tela de descanso da TV da cozinha (fora do rodízio): UMA página só, com
// tudo — hora e temperatura no cabeçalho, buffet à esquerda, saladas e
// marmitas Kern à direita, aniversariantes e recados no espaço que sobra
// embaixo do buffet. Sem hooks: desenhada no servidor (modo simples) e no
// navegador (modo normal) do mesmo jeito.
//
// Marmitas Kern embutidas: o prato do buffet que também vai na marmita ganha o
// selo "M"; o que a marmita tem de diferente aparece no quadro "Extra".
import { rotuloDia, rotuloDiaLongo } from "@/lib/dia-cardapio";

export type RecadoTv = { id: string; texto: string };
export type AniversarianteTv = { nome: string; dia: number; hoje: boolean };

export type CardapioTv = {
  dia: string;                    // YYYY-MM-DD do cardápio que vale agora
  buffet: { proteinas: string[]; carboidratos: string[]; especial: string[]; publicado: boolean } | null;
  saladas: { categoria: string; itens: string[] }[] | null;
  kern: { pratos: string[]; proteinas: string[]; salada: string; quantidade: number; horaEntrega: string; nomeConvenio: string; bloqueado: string | null } | null;
};

const LARANJA = "#C78340";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
// Tamanhos proporcionais à ALTURA da TV: o projeto é em px de 1080p e a TV de
// 32" (768p) mostra tudo a 71% — nada corta, nada rola.
const vh = (n: number) => `${(n / 10.8).toFixed(2)}vh`;

// Hora/minuto/segundo e mês em horário de Brasília (o servidor roda em UTC).
function partesSP(agora: number) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", hour12: false, month: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(agora));
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { hora: g("hour").replace("24", "00"), min: g("minute"), seg: g("second"), mes: Number(g("month")) };
}

// "Arroz Branco " ≈ "arroz branco": sem acento, sem caixa, sem espaço sobrando.
function chave(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
// O mesmo prato escrito um pouco diferente nos dois cadastros ("Frango grelhado"
// × "Frango grelhado ao molho") conta como igual quando um contém o outro.
function mesmoPrato(a: string, b: string) {
  const x = chave(a), y = chave(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const menor = x.length < y.length ? x : y;
  return menor.length >= 6 && (x.includes(y) || y.includes(x));
}

// Cabeçalho: título + dia do cardápio à esquerda; hora grande + temperatura à direita.
function Cabecalho({ titulo, dia, agora, temperatura, piscar }: { titulo: string; dia: string; agora: number; temperatura: number | null; piscar: boolean }) {
  const p = partesSP(agora);
  const apagado = piscar && Number(p.seg) % 2 === 1; // dois pontos piscam sem mexer na largura
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, marginBottom: 12, borderBottom: `3px solid ${LARANJA}`, paddingBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 28, minWidth: 0 }}>
        <span style={{ fontSize: vh(36), fontWeight: 900, letterSpacing: "0.1em", color: LARANJA, whiteSpace: "nowrap" }}>{titulo}</span>
        <span style={{ fontSize: vh(30), fontWeight: 800, color: "#ddd", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{rotuloDia(dia)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 22, whiteSpace: "nowrap" }}>
        {temperatura != null && <span style={{ fontSize: vh(36), fontWeight: 800, color: "#bbb" }}>{Math.round(temperatura)}°C</span>}
        <span style={{ fontSize: vh(64), lineHeight: 1, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>
          {p.hora}<span style={{ color: LARANJA, visibility: apagado ? "hidden" : "visible" }}>:</span>{p.min}
        </span>
      </div>
    </div>
  );
}

// Selo "M" ao lado do prato que também vai na marmita (desenhado em CSS, não em
// emoji: a TV antiga não tem fonte de emoji).
function SeloMarmita({ tamanho }: { tamanho: number }) {
  return (
    <span
      title="vai na marmita"
      style={{
        display: "inline-block", verticalAlign: "middle", marginLeft: 12, minWidth: vh(tamanho * 0.9), height: vh(tamanho * 0.9), lineHeight: vh(tamanho * 0.9),
        borderRadius: 6, background: LARANJA, color: "#211915", fontSize: vh(tamanho * 0.55), fontWeight: 900, textAlign: "center", padding: "0 5px", letterSpacing: "0.02em",
      }}
    >
      M
    </span>
  );
}

type ItemTv = { nome: string; marmita: boolean };

// Lista grande; passando de `porColuna` itens, divide em duas colunas em vez de rolar.
function Lista({ itens, tamanho = 32, porColuna = 6, cor = LARANJA, compacto = false }: { itens: ItemTv[]; tamanho?: number; porColuna?: number; cor?: string; compacto?: boolean }) {
  const duas = itens.length > porColuna;
  const meio = Math.ceil(itens.length / 2);
  const colunas = duas ? [itens.slice(0, meio), itens.slice(meio)] : [itens];
  return (
    <div style={{ display: "flex", gap: 32 }}>
      {colunas.map((col, i) => (
        <ul key={i} style={{ flex: 1, listStyle: "none", margin: 0, padding: 0 }}>
          {col.map((it, j) => (
            <li key={j} style={{ fontSize: vh(tamanho), lineHeight: compacto ? 1.15 : 1.22, fontWeight: 700, color: "#fff", padding: compacto ? "1px 0" : "3px 0", overflowWrap: "anywhere" }}>
              <span style={{ color: cor, marginRight: 12 }}>•</span>{it.nome}{it.marmita && <SeloMarmita tamanho={tamanho} />}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function Grupo({ titulo, itens, tamanho, porColuna, cor }: { titulo: string; itens: ItemTv[]; tamanho?: number; porColuna?: number; cor?: string }) {
  if (itens.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: vh(20), fontWeight: 900, letterSpacing: "0.16em", color: "#888", marginBottom: 2 }}>{titulo.toUpperCase()}</div>
      <Lista itens={itens} tamanho={tamanho} porColuna={porColuna} cor={cor} />
    </div>
  );
}

// Cruza o cardápio da marmita com o buffet e as saladas: o que bate ganha o
// selo; o que sobra é "extra" da marmita.
function cruzarKern(c: CardapioTv) {
  const k = c.kern && !c.kern.bloqueado ? c.kern : null;
  const daMarmita = k ? [...k.pratos, ...k.proteinas] : [];
  const usados = new Set<number>();
  const marcar = (nome: string) => {
    const i = daMarmita.findIndex((m, idx) => !usados.has(idx) && mesmoPrato(m, nome));
    if (i >= 0) usados.add(i);
    return i >= 0;
  };
  const b = c.buffet;
  const buffet = b
    ? {
        proteinas: b.proteinas.map((n) => ({ nome: n, marmita: marcar(n) })),
        carboidratos: b.carboidratos.map((n) => ({ nome: n, marmita: marcar(n) })),
        especial: b.especial.map((n) => ({ nome: n, marmita: marcar(n) })),
      }
    : null;
  let saladaMarmita = k?.salada?.trim() || "";
  const saladas = (c.saladas ?? []).map((g) => ({
    categoria: g.categoria,
    itens: g.itens.map((n) => {
      const bate = !!saladaMarmita && mesmoPrato(saladaMarmita, n);
      if (bate) saladaMarmita = "";
      return { nome: n, marmita: bate };
    }),
  }));
  const extras = daMarmita.filter((_, idx) => !usados.has(idx));
  if (saladaMarmita) extras.push(`Salada: ${saladaMarmita}`);
  return { buffet, saladas, extras, kern: k, temMarmita: !!k && daMarmita.length > 0 };
}

// Aniversariantes do mês (quem faz hoje ganha destaque) e recados, compactos,
// no espaço que sobra embaixo do buffet.
function Avisos({ aniversariantes, recados, mes }: { aniversariantes: AniversarianteTv[]; recados: RecadoTv[]; mes: number }) {
  if (aniversariantes.length === 0 && recados.length === 0) return null;
  const hoje = aniversariantes.filter((a) => a.hoje);
  const outros = aniversariantes.filter((a) => !a.hoje);
  return (
    <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      {recados.slice(0, 3).map((r) => (
        <div key={r.id} style={{ background: "#3a2410", borderLeft: `12px solid ${LARANJA}`, borderRadius: 14, padding: "10px 18px", fontSize: vh(recados.length > 1 ? 24 : 28), lineHeight: 1.2, fontWeight: 800, color: "#fff", overflowWrap: "anywhere" }}>
          {r.texto}
        </div>
      ))}
      {aniversariantes.length > 0 && (
        <div>
          <div style={{ fontSize: vh(18), fontWeight: 900, letterSpacing: "0.16em", color: "#777" }}>ANIVERSARIANTES DE {MESES[mes - 1].toUpperCase()}</div>
          {hoje.length > 0 && (
            <div style={{ marginTop: 6, background: LARANJA, borderRadius: 12, padding: "8px 18px", fontSize: vh(30), fontWeight: 900, color: "#fff" }}>
              HOJE: {hoje.map((a) => a.nome).join(", ")} — parabéns!
            </div>
          )}
          {outros.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {outros.map((a) => (
                <div key={a.nome + a.dia} style={{ background: "#1c1c1c", border: "2px solid #3a2410", borderRadius: 10, padding: "4px 12px", fontSize: vh(22), fontWeight: 700, color: "#eee", whiteSpace: "nowrap" }}>
                  <span style={{ color: LARANJA, fontVariantNumeric: "tabular-nums" }}>{String(a.dia).padStart(2, "0")}</span> {a.nome}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A tela inteira: cabeçalho com hora, buffet + avisos à esquerda (3/5),
// saladas + marmitas à direita (2/5).
export function TvPaginaCardapio({
  cardapio: c, agora, recados, temperatura, aniversariantes, piscar,
}: {
  cardapio: CardapioTv; agora: number; recados: RecadoTv[]; temperatura: number | null; aniversariantes: AniversarianteTv[]; piscar: boolean;
}) {
  const x = cruzarKern(c);
  const semCardapio = !c.buffet && x.saladas.length === 0;
  const totalBuffet = c.buffet ? c.buffet.proteinas.length + c.buffet.carboidratos.length + c.buffet.especial.length : 0;
  const tamBuffet = totalBuffet > 16 ? 28 : totalBuffet > 12 ? 31 : 34;
  const totalSal = x.saladas.reduce((s, g) => s + g.itens.length, 0);
  const tamSal = totalSal > 14 ? 22 : totalSal > 9 ? 24 : 27;
  const kernNome = (c.kern?.nomeConvenio || "Kern").toUpperCase();
  const mes = partesSP(agora).mes;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 32px 0", overflow: "hidden" }}>
      <Cabecalho titulo="CARDÁPIO DO DIA" dia={c.dia} agora={agora} temperatura={temperatura} piscar={piscar} />
      {c.buffet && !c.buffet.publicado && <div style={{ fontSize: vh(18), color: "#f59e0b", fontWeight: 700, marginBottom: 6 }}>rascunho — ainda não publicado no site</div>}
      {semCardapio ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: vh(44), fontWeight: 800, color: "#666", textAlign: "center", maxWidth: 1100 }}>Cardápio de {rotuloDiaLongo(c.dia)} ainda não cadastrado</p>
          </div>
          <Avisos aniversariantes={aniversariantes} recados={recados} mes={mes} />
          <div style={{ height: 12 }} />
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", gap: 40, minHeight: 0 }}>
          {/* Buffet + avisos */}
          <div style={{ flex: 3, minWidth: 0, display: "flex", flexDirection: "column", paddingBottom: 12 }}>
            {x.buffet ? (
              <>
                <Grupo titulo="Proteínas" itens={x.buffet.proteinas} tamanho={tamBuffet} porColuna={6} />
                <Grupo titulo="Acompanhamentos" itens={x.buffet.carboidratos} tamanho={tamBuffet} porColuna={6} />
                <Grupo titulo="Especial do dia" itens={x.buffet.especial} tamanho={tamBuffet} porColuna={6} />
              </>
            ) : (
              <p style={{ fontSize: vh(30), fontWeight: 800, color: "#666" }}>Buffet de {rotuloDiaLongo(c.dia)} ainda não cadastrado</p>
            )}
            <Avisos aniversariantes={aniversariantes} recados={recados} mes={mes} />
          </div>
          {/* Saladas + marmitas */}
          <div style={{ flex: 2, minWidth: 0, display: "flex", flexDirection: "column", borderLeft: "2px solid #333", paddingLeft: 32 }}>
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <div style={{ fontSize: vh(20), fontWeight: 900, letterSpacing: "0.16em", color: "#4ade80", marginBottom: 4 }}>SALADAS</div>
              {x.saladas.length === 0 ? (
                <p style={{ fontSize: vh(24), fontWeight: 700, color: "#666", margin: 0 }}>ainda não marcadas</p>
              ) : (
                x.saladas.map((g) => (
                  <div key={g.categoria} style={{ marginBottom: 5 }}>
                    <div style={{ fontSize: vh(16), fontWeight: 900, letterSpacing: "0.14em", color: "#777" }}>{g.categoria.toUpperCase()}</div>
                    {/* muitas saladas → nomes na mesma linha, separados por ponto */}
                    {totalSal > 12 ? (
                      <div style={{ fontSize: vh(tamSal), lineHeight: 1.3, fontWeight: 700, color: "#fff" }}>
                        {g.itens.map((it, i) => (
                          <span key={i}>{i > 0 && <span style={{ color: "#4ade80", margin: "0 10px" }}>·</span>}{it.nome}{it.marmita && <SeloMarmita tamanho={tamSal} />}</span>
                        ))}
                      </div>
                    ) : (
                      <Lista itens={g.itens} tamanho={tamSal} porColuna={99} cor="#4ade80" compacto />
                    )}
                  </div>
                ))
              )}
            </div>
            {/* Marmitas Kern */}
            <div style={{ marginTop: 8, marginBottom: 10, background: "#3a2410", borderLeft: `12px solid ${LARANJA}`, borderRadius: 14, padding: "10px 16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: vh(20), fontWeight: 900, letterSpacing: "0.12em", color: "#ffd9a8" }}>MARMITAS {kernNome}</span>
                {x.kern && x.temMarmita && (
                  <span style={{ fontSize: vh(24), fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {x.kern.quantidade} un · saem {x.kern.horaEntrega}
                  </span>
                )}
              </div>
              {x.temMarmita && (
                <div style={{ fontSize: vh(15), fontWeight: 700, color: "#c9a97e", marginTop: 2 }}><SeloMarmita tamanho={15} /> = prato do buffet que também vai na marmita</div>
              )}
              {c.kern?.bloqueado ? (
                <div style={{ fontSize: vh(24), fontWeight: 700, color: "#ddd", marginTop: 4 }}>Sem marmita hoje — {c.kern.bloqueado}</div>
              ) : !x.temMarmita ? (
                <div style={{ fontSize: vh(22), fontWeight: 700, color: "#999", marginTop: 4 }}>Cardápio da marmita ainda não cadastrado</div>
              ) : x.extras.length === 0 ? (
                <div style={{ fontSize: vh(22), fontWeight: 700, color: "#ddd", marginTop: 4 }}>Vai o mesmo do buffet (pratos com <SeloMarmita tamanho={22} />)</div>
              ) : (
                <>
                  <div style={{ fontSize: vh(16), fontWeight: 900, letterSpacing: "0.14em", color: "#ffd9a8", marginTop: 6 }}>EXTRA — SÓ NA MARMITA</div>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {x.extras.map((e, i) => (
                      <li key={i} style={{ fontSize: vh(24), lineHeight: 1.2, fontWeight: 800, color: "#fff", padding: "1px 0" }}>
                        <span style={{ color: LARANJA, marginRight: 12 }}>+</span>{e}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
