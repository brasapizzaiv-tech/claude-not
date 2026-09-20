// Tela de descanso da TV da cozinha (fora do rodízio): UMA página, três
// blocos com título próprio — CARDÁPIO DO DIA (buffet), MARMITAS (Kern) e
// SALADAS — com os itens NUMERADOS (a numeração corre pelo bloco inteiro e
// recomeça em cada bloco). Hora e temperatura no cabeçalho; aniversariantes e
// recados no espaço que sobra embaixo do buffet.
// Sem hooks e sem emoji: desenhada no servidor (modo simples, TV antiga) e no
// navegador (modo normal) do mesmo jeito. Os dados vêm prontos de
// src/lib/cardapio-dia-core.ts (montarCardapioDia).
import { rotuloDia, rotuloDiaLongo } from "@/lib/dia-cardapio";
import type { CardapioTv } from "@/lib/cardapio-dia-core";
import { APONTAMENTOS_NA_TELA, APONTAMENTOS_POR_PAGINA, tituloApontamentos, type ApontamentoTv } from "@/lib/checklists-core";

export type { CardapioTv } from "@/lib/cardapio-dia-core";
export type RecadoTv = { id: string; texto: string };
export type AniversarianteTv = { nome: string; dia: number; hoje: boolean };

const LARANJA = "#C78340";
const AMBAR = "#ffb84d";   // marmitas
const VERDE = "#4ade80";   // saladas
const VERMELHO = "#f87171"; // pontos de atenção
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

// Cabeçalho: dia do cardápio à esquerda; hora grande + temperatura à direita.
function Cabecalho({ dia, agora, temperatura, piscar }: { dia: string; agora: number; temperatura: number | null; piscar: boolean }) {
  const p = partesSP(agora);
  const apagado = piscar && Number(p.seg) % 2 === 1; // dois pontos piscam sem mexer na largura
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, marginBottom: 10, borderBottom: `3px solid ${LARANJA}`, paddingBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 22, minWidth: 0 }}>
        <span style={{ fontSize: vh(34), fontWeight: 900, letterSpacing: "0.1em", color: LARANJA, whiteSpace: "nowrap" }}>BRASA</span>
        <span style={{ fontSize: vh(34), fontWeight: 800, color: "#ddd", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{rotuloDia(dia)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 22, whiteSpace: "nowrap" }}>
        {temperatura != null && <span style={{ fontSize: vh(34), fontWeight: 800, color: "#bbb" }}>{Math.round(temperatura)}°C</span>}
        <span style={{ fontSize: vh(60), lineHeight: 1, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>
          {p.hora}<span style={{ color: LARANJA, visibility: apagado ? "hidden" : "visible" }}>:</span>{p.min}
        </span>
      </div>
    </div>
  );
}

// Moldura de um bloco: título grande na cor do bloco e uma linha embaixo.
function Bloco({ titulo, cor, extra, children, style }: { titulo: string; cor: string; extra?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, border: "2px solid #2a2a2a", borderRadius: 16, padding: "8px 16px 10px", background: "#111", ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, borderBottom: `3px solid ${cor}`, paddingBottom: 4, marginBottom: 8 }}>
        <span style={{ fontSize: vh(28), fontWeight: 900, letterSpacing: "0.14em", color: cor, whiteSpace: "nowrap" }}>{titulo}</span>
        {extra}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// Lista NUMERADA a partir de `inicio`; passando de `porColuna` itens, divide
// em duas colunas em vez de rolar. O número fica em destaque, na cor do bloco.
function Lista({ itens, inicio, cor, tamanho, porColuna = 6, compacto = false, contagem }: { itens: string[]; inicio: number; cor: string; tamanho: number; porColuna?: number; compacto?: boolean; contagem?: Record<string, number> }) {
  const duas = itens.length > porColuna;
  const meio = Math.ceil(itens.length / 2);
  const colunas = duas ? [itens.slice(0, meio), itens.slice(meio)] : [itens];
  let n = inicio;
  return (
    <div style={{ display: "flex", gap: 28 }}>
      {colunas.map((col, i) => (
        <ol key={i} style={{ flex: 1, listStyle: "none", margin: 0, padding: 0 }}>
          {col.map((nome, j) => {
            const num = n++;
            return (
              <li key={j} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: vh(tamanho), lineHeight: compacto ? 1.15 : 1.22, fontWeight: 700, color: "#fff", padding: compacto ? "1px 0" : "2px 0", overflowWrap: "anywhere" }}>
                <span style={{ minWidth: "1.5em", textAlign: "right", color: cor, fontWeight: 900, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{num}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{nome}</span>
                {/* Quantas pessoas pediram este item. Fica à direita, na cor
                    do bloco, pra cozinha ler a coluna de números de relance.
                    Item que ninguém pediu não ganha zero: fica em branco, que
                    é mais fácil de varrer com o olho. */}
                {contagem ? (
                  <span
                    style={{
                      flexShrink: 0,
                      minWidth: "2.2em",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 900,
                      color: contagem[nome.trim().toLowerCase()] ? cor : "transparent",
                    }}
                  >
                    {contagem[nome.trim().toLowerCase()] ?? 0}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ))}
    </div>
  );
}

function Subtitulo({ texto }: { texto: string }) {
  return <div style={{ fontSize: vh(17), fontWeight: 900, letterSpacing: "0.16em", color: "#888", marginBottom: 1, marginTop: 2 }}>{texto.toUpperCase()}</div>;
}

// Aniversariantes do mês (quem faz hoje ganha destaque) e recados, compactos,
// no espaço que sobra embaixo do buffet.
// compacto = tem bloco de pontos de atenção na tela: os aniversariantes do mês
// saem (fica só quem faz hoje) e só um recado aparece, pra tudo caber.
function Avisos({ aniversariantes, recados, mes, compacto = false }: { aniversariantes: AniversarianteTv[]; recados: RecadoTv[]; mes: number; compacto?: boolean }) {
  if (aniversariantes.length === 0 && recados.length === 0) return null;
  const hoje = aniversariantes.filter((a) => a.hoje);
  const outros = compacto ? [] : aniversariantes.filter((a) => !a.hoje);
  if (compacto && hoje.length === 0 && recados.length === 0) return null;
  return (
    <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {recados.slice(0, compacto ? 1 : 3).map((r) => (
        <div key={r.id} style={{ background: "#3a2410", borderLeft: `12px solid ${LARANJA}`, borderRadius: 14, padding: "8px 16px", fontSize: vh(recados.length > 1 ? 22 : 26), lineHeight: 1.2, fontWeight: 800, color: "#fff", overflowWrap: "anywhere" }}>
          {r.texto}
        </div>
      ))}
      {(compacto ? hoje.length > 0 : aniversariantes.length > 0) && (
        <div>
          {!compacto && <div style={{ fontSize: vh(16), fontWeight: 900, letterSpacing: "0.16em", color: "#777" }}>ANIVERSARIANTES DE {MESES[mes - 1].toUpperCase()}</div>}
          {hoje.length > 0 && (
            <div style={{ marginTop: 4, background: LARANJA, borderRadius: 12, padding: "6px 16px", fontSize: vh(28), fontWeight: 900, color: "#fff" }}>
              HOJE: {hoje.map((a) => a.nome).join(", ")} — parabéns!
            </div>
          )}
          {outros.length > 0 && (
            <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {outros.map((a) => (
                <div key={a.nome + a.dia} style={{ background: "#1c1c1c", border: "2px solid #3a2410", borderRadius: 10, padding: "3px 10px", fontSize: vh(20), fontWeight: 700, color: "#eee", whiteSpace: "nowrap" }}>
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

// Pontos de atenção (apontamentos da revisão): itens numerados, setor em
// destaque. Até APONTAMENTOS_NA_TELA cabem dentro da tela do cardápio; acima
// disso o bloco vira página própria na rotação (nunca espremer nem rolar).
function Apontamentos({ itens, tamanho, titulo, cheio = false }: { itens: ApontamentoTv[]; tamanho: number; titulo: string; cheio?: boolean }) {
  return (
    <div style={{ border: `3px solid ${VERMELHO}`, borderRadius: 16, background: "#2a1212", padding: cheio ? "18px 28px 22px" : "10px 18px 12px", ...(cheio ? { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0 } : {}) }}>
      <div style={{ fontSize: vh(cheio ? 34 : 26), fontWeight: 900, letterSpacing: "0.12em", color: VERMELHO, marginBottom: cheio ? 14 : 6 }}>{titulo}</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {itens.map((a, i) => (
          <li key={a.id} style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: vh(tamanho), lineHeight: 1.22, fontWeight: 700, color: "#fff", padding: cheio ? "6px 0" : "3px 0", overflowWrap: "anywhere" }}>
            <span style={{ minWidth: "1.4em", textAlign: "right", color: VERMELHO, fontWeight: 900, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{i + 1}</span>
            <span>
              {a.setor && <span style={{ color: "#ffd9a8", fontWeight: 900, letterSpacing: "0.08em", marginRight: 10 }}>{a.setor.toUpperCase()}</span>}
              {a.texto}
              {a.pessoa && <span style={{ color: "#bbb", fontWeight: 700 }}> — {a.pessoa}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Quantas páginas a TV tem agora: 1 (cardápio) + as de apontamentos, quando
// eles não couberem dentro da tela.
export function totalPaginasTv(apontamentos: ApontamentoTv[] = []): number {
  if (apontamentos.length <= APONTAMENTOS_NA_TELA) return 1;
  return 1 + Math.ceil(apontamentos.length / APONTAMENTOS_POR_PAGINA);
}

// Pontinhos do rodapé (só quando há mais de uma página).
export function TvPontos({ pagina, total }: { pagina: number; total: number }) {
  if (total <= 1) return null;
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{ width: i === pagina ? 14 : 10, height: i === pagina ? 14 : 10, borderRadius: 7, background: i === pagina ? LARANJA : "#444", display: "inline-block" }} />
      ))}
    </span>
  );
}

// A tela inteira: cabeçalho com hora; CARDÁPIO DO DIA + avisos à esquerda (3/5);
// MARMITAS em cima e SALADAS embaixo à direita (2/5).
export function TvPaginaCardapio({
  cardapio: c, agora, recados, temperatura, aniversariantes, piscar, apontamentos = [], pagina = 0,
}: {
  cardapio: CardapioTv; agora: number; recados: RecadoTv[]; temperatura: number | null; aniversariantes: AniversarianteTv[]; piscar: boolean;
  apontamentos?: ApontamentoTv[]; pagina?: number;
}) {
  const totalPaginas = totalPaginasTv(apontamentos);
  const naTela = apontamentos.length > 0 && apontamentos.length <= APONTAMENTOS_NA_TELA ? apontamentos : [];
  // Página 1+ da rotação: só os pontos de atenção, grandes.
  if (pagina > 0 && totalPaginas > 1) {
    const ini = (pagina - 1) * APONTAMENTOS_POR_PAGINA;
    const desta = apontamentos.slice(ini, ini + APONTAMENTOS_POR_PAGINA);
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 28px 0", overflow: "hidden" }}>
        <Cabecalho dia={c.dia} agora={agora} temperatura={temperatura} piscar={piscar} />
        <div style={{ flex: 1, minHeight: 0, paddingBottom: 12, display: "flex", flexDirection: "column" }}>
          <Apontamentos
            cheio
            itens={desta}
            tamanho={desta.length > 6 ? 38 : desta.length > 4 ? 44 : 50}
            titulo={`${tituloApontamentos(apontamentos)}${totalPaginas > 2 ? ` (${pagina}/${totalPaginas - 1})` : ""}`}
          />
        </div>
      </div>
    );
  }
  const b = c.buffet;
  const totalBuffet = b ? b.proteinas.length + b.carboidratos.length + b.especial.length : 0;
  const tamBuffet = totalBuffet > 18 ? 26 : totalBuffet > 14 ? 28 : totalBuffet > 10 ? 31 : 34;
  const k = c.kern && !c.kern.bloqueado ? c.kern : null;
  const totalKern = k ? k.pratos.length + k.proteinas.length : 0;
  const saladas = c.saladas ?? [];
  const totalSal = saladas.reduce((s, g) => s + g.itens.length, 0);
  // A coluna da direita divide a altura entre marmitas e saladas: a fonte cai
  // conforme o total de linhas dos dois blocos.
  const totalDir = totalKern + totalSal + saladas.length;
  const tamDir = totalDir > 28 ? 20 : totalDir > 22 ? 21 : totalDir > 16 ? 23 : 26;
  const mes = partesSP(agora).mes;
  const kernNome = (c.kern?.nomeConvenio || "Kern").toUpperCase();
  const nProt = b?.proteinas.length ?? 0, nCarb = b?.carboidratos.length ?? 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 28px 0", overflow: "hidden" }}>
      <Cabecalho dia={c.dia} agora={agora} temperatura={temperatura} piscar={piscar} />
      <div style={{ flex: 1, display: "flex", gap: 20, minHeight: 0, paddingBottom: 10 }}>
        {/* ===== CARDÁPIO DO DIA (buffet) ===== */}
        <Bloco
          titulo="CARDÁPIO DO DIA"
          cor={LARANJA}
          style={{ flex: 3 }}
          extra={b && !b.publicado ? <span style={{ fontSize: vh(18), color: "#f59e0b", fontWeight: 700 }}>rascunho — ainda não publicado</span> : undefined}
        >
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {b ? (
              <>
                {nProt > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <Subtitulo texto="Proteínas" />
                    <Lista itens={b.proteinas} inicio={1} cor={LARANJA} tamanho={tamBuffet} porColuna={6} />
                  </div>
                )}
                {nCarb > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <Subtitulo texto="Acompanhamentos" />
                    <Lista itens={b.carboidratos} inicio={nProt + 1} cor={LARANJA} tamanho={tamBuffet} porColuna={6} />
                  </div>
                )}
                {b.especial.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <Subtitulo texto="Especial do dia" />
                    <Lista itens={b.especial} inicio={nProt + nCarb + 1} cor={LARANJA} tamanho={tamBuffet} porColuna={6} />
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: vh(30), fontWeight: 800, color: "#666", margin: "12px 0" }}>Cardápio de {rotuloDiaLongo(c.dia)} ainda não cadastrado</p>
            )}
            <div style={{ marginTop: "auto" }}>
              <Avisos aniversariantes={aniversariantes} recados={recados} mes={mes} compacto={naTela.length > 0} />
              {naTela.length > 0 && (
                <div style={{ paddingTop: 8 }}>
                  <Apontamentos itens={naTela} tamanho={naTela.length > 2 ? 24 : 28} titulo={tituloApontamentos(naTela)} />
                </div>
              )}
            </div>
          </div>
        </Bloco>

        {/* ===== coluna da direita ===== */}
        <div style={{ flex: 2, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ===== MARMITAS ===== */}
          <Bloco
            titulo={`MARMITAS ${kernNome}`}
            cor={AMBAR}
            extra={k ? <span style={{ fontSize: vh(22), fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{k.quantidade} un · saem {k.horaEntrega}</span> : undefined}
          >
            {c.kern?.bloqueado ? (
              <p style={{ fontSize: vh(24), fontWeight: 700, color: "#ddd", margin: 0 }}>Sem marmita hoje — {c.kern.bloqueado}</p>
            ) : !k || totalKern === 0 ? (
              <p style={{ fontSize: vh(22), fontWeight: 700, color: "#777", margin: 0 }}>Cardápio da marmita ainda não cadastrado</p>
            ) : (
              <>
                {k.pratos.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <Subtitulo texto="Pratos" />
                    <Lista itens={k.pratos} inicio={1} cor={AMBAR} tamanho={tamDir} porColuna={3} compacto contagem={k.escolhas} />
                  </div>
                )}
                {k.proteinas.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <Subtitulo texto="Proteínas (escolhe uma)" />
                    <Lista itens={k.proteinas} inicio={k.pratos.length + 1} cor={AMBAR} tamanho={tamDir} porColuna={4} compacto contagem={k.escolhas} />
                  </div>
                )}
                {k.salada && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: vh(tamDir - 2), fontWeight: 700, color: "#ccc" }}>
                    <span style={{ color: "#888", letterSpacing: "0.12em", fontSize: vh(16), fontWeight: 900, flexShrink: 0 }}>SALADA</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{k.salada}</span>
                    {/* Aqui o número quer dizer QUANTOS LEVARAM: a salada do
                        dia é uma só, e quem não quis não escolhe outra. */}
                    <span style={{ flexShrink: 0, minWidth: "2.2em", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 900, color: k.escolhas[k.salada.trim().toLowerCase()] ? AMBAR : "transparent" }}>
                      {k.escolhas[k.salada.trim().toLowerCase()] ?? 0}
                    </span>
                  </div>
                )}
                {/* A divisão por loja, numa linha própria embaixo: a cozinha
                    embala por destino, então o total sozinho não basta. Fica
                    recuado até onde começa o nome da salada, pra leitura
                    descer em coluna. */}
                {k.saladaPorLoja.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0 18px", paddingLeft: "5.2em", marginTop: 1, fontSize: vh(tamDir - 6), fontWeight: 700, color: "#888" }}>
                    {k.saladaPorLoja.map((x) => (
                      <span key={x.loja} style={{ whiteSpace: "nowrap" }}>
                        {x.loja} <span style={{ color: AMBAR, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{x.n}</span>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </Bloco>

          {/* ===== SALADAS ===== */}
          <Bloco titulo="SALADAS" cor={VERDE} style={{ flex: 1 }} extra={totalSal > 0 ? <span style={{ fontSize: vh(20), fontWeight: 800, color: "#888" }}>{totalSal} no buffet</span> : undefined}>
            {saladas.length === 0 ? (
              <p style={{ fontSize: vh(22), fontWeight: 700, color: "#777", margin: 0 }}>Saladas de {rotuloDiaLongo(c.dia)} ainda não marcadas</p>
            ) : (
              (() => {
                let inicio = 1;
                return saladas.map((g) => {
                  const ini = inicio; inicio += g.itens.length;
                  return (
                    <div key={g.categoria} style={{ marginBottom: 2 }}>
                      <Subtitulo texto={g.categoria} />
                      <Lista itens={g.itens} inicio={ini} cor={VERDE} tamanho={tamDir} porColuna={2} compacto />
                    </div>
                  );
                });
              })()
            )}
          </Bloco>
        </div>
      </div>
    </div>
  );
}
