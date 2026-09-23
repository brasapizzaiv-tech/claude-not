// Tela de descanso da TV da cozinha (fora do rodízio): UMA página, três
// blocos com título próprio — CARDÁPIO DO DIA (buffet), MARMITAS (Kern) e
// SALADAS — com os itens NUMERADOS (a numeração corre pelo bloco inteiro e
// recomeça em cada bloco). Hora e temperatura no cabeçalho; aniversariantes e
// recados no espaço que sobra embaixo do buffet.
// Sem hooks e sem emoji: desenhada no servidor (modo simples, TV antiga) e no
// navegador (modo normal) do mesmo jeito. Os dados vêm prontos de
// src/lib/cardapio-dia-core.ts (montarCardapioDia).
import { rotuloDia, rotuloDiaLongo } from "@/lib/dia-cardapio";
import { TV } from "@/lib/tv-cores";
import type { CardapioTv } from "@/lib/cardapio-dia-core";
import { APONTAMENTOS_NA_TELA, APONTAMENTOS_POR_PAGINA, tituloApontamentos, type ApontamentoTv } from "@/lib/checklists-core";
import { SITUACAO, proximos, rotuloDaData, type Feriado } from "@/lib/feriados";

export type { CardapioTv } from "@/lib/cardapio-dia-core";
export type RecadoTv = { id: string; texto: string };
export type AniversarianteTv = { nome: string; dia: number; hoje: boolean };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
// Tamanhos proporcionais à ALTURA da TV: o projeto é em px de 1080p e a TV de
// 32" (768p) mostra tudo a 71% — nada corta, nada rola.
const vh = (n: number) => `${(n / 10.8).toFixed(2)}vh`;

// A TELA MEDIDA EM PX DE 1080p
//
// Tudo aqui é desenhado num projeto de 1920x1080 e depois a TV mostra na
// escala dela (a de 32" mostra a 71%). As medidas abaixo são desse projeto: é
// o espaço que cada bloco tem pra encher, e é contra elas que a letra é
// calculada. Os números saíram de medir a tela pronta, não de somar as
// margens: sobra de cabeçalho e entrelinha nunca fecha na conta.
const ALTURA_DO_BUFFET = 845;   // o bloco do cardápio, sem cabeçalho nem moldura
const LARGURA_DO_BUFFET = 515;  // cada uma das duas colunas de dentro dele
const ALTURA_DA_DIREITA = 700;  // marmitas + saladas somados
const LARGURA_DA_DIREITA = 700;

/** Quantas linhas de tela um texto ocupa numa coluna de `largura`, com letra de
 *  tamanho `n`. É régua de padeiro (largura média de caractere = 0,52 do
 *  tamanho da letra), mas é o bastante pra saber se o nome vai quebrar — e era
 *  justamente isso que faltava: "Bife de frango ao molho de nata" ocupa duas
 *  linhas, e contar como uma fazia a lista passar do pé da tela. */
function linhasDeTexto(texto: string, n: number, largura: number) {
  const cabem = Math.max(6, Math.floor(largura / (n * 0.52)));
  return Math.max(1, Math.ceil(texto.length / cabem));
}

const ALTURA_DO_SUBTITULO = 17 * 1.35 + 3;

/** O que sobra da largura pro NOME, depois do número da esquerda (1,5 em mais
 *  o espaço) e, quando tem, da contagem da direita (2,2 em). Esquecer disso era
 *  o que fazia "Massa parafuso" quebrar em duas linhas sem aviso. */
const larguraDoNome = (largura: number, n: number, contagem = false) =>
  largura - (n * 1.5 + 10) - (contagem ? n * 2.2 : 0);

/** Margem de erro. A régua é aproximada e errar pra baixo custa caro — item
 *  cortado no pé da tela é item que a cozinha não vê. Errar pra cima custa uma
 *  letra um tiquinho menor, que ninguém nota. */
const FOLGA = 1.12;

/** A maior letra, de `maior` pra baixo, que faz o bloco caber. Provar tamanho
 *  por tamanho é mais bobo que uma fórmula, mas é exato: a quebra de linha
 *  muda com o tamanho da letra, então não dá pra resolver de cabeça. */
function maiorQueCabe(altura: (n: number) => number, cabe: number, menor: number, maior: number) {
  for (let n = maior; n > menor; n--) if (altura(n) <= cabe) return n;
  return menor;
}

/** O dia de hoje em São Paulo, no formato das datas do banco. */
const hojeSp = (agora: number) => new Date(agora).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

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
  // Os dois pontos piscam ESMAECENDO, não sumindo: apagando de vez a hora fica
  // com um buraco no meio e, de longe, parece "20 04" em vez de "20:04".
  const apagado = piscar && Number(p.seg) % 2 === 1;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, marginBottom: 10, borderBottom: `3px solid ${TV.laranja}`, paddingBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 22, minWidth: 0 }}>
        <span style={{ fontSize: vh(34), fontWeight: 900, letterSpacing: "0.1em", color: TV.laranja, whiteSpace: "nowrap" }}>BRASA</span>
        <span style={{ fontSize: vh(34), fontWeight: 800, color: TV.suave, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{rotuloDia(dia)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 22, whiteSpace: "nowrap" }}>
        {temperatura != null && <span style={{ fontSize: vh(34), fontWeight: 800, color: TV.fraco }}>{Math.round(temperatura)}°C</span>}
        <span style={{ fontSize: vh(60), lineHeight: 1, fontWeight: 900, color: TV.texto, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>
          {p.hora}<span style={{ color: TV.laranja, opacity: apagado ? 0.45 : 1 }}>:</span>{p.min}
        </span>
      </div>
    </div>
  );
}

// Moldura de um bloco: título grande na cor do bloco e uma linha embaixo.
function Bloco({ titulo, cor, extra, children, style }: { titulo: string; cor: string; extra?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, border: `2px solid ${TV.borda}`, borderRadius: 16, padding: "8px 16px 10px", background: TV.bloco, ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, borderBottom: `3px solid ${cor}`, paddingBottom: 4, marginBottom: 8 }}>
        <span style={{ fontSize: vh(28), fontWeight: 900, letterSpacing: "0.14em", color: cor, whiteSpace: "nowrap" }}>{titulo}</span>
        {extra}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

/** Nome comprido em duas colunas vira três linhas quebradas e a lista perde o
 *  alinhamento. Só divide quando todos os nomes são curtos. */
function cabeEmDuas(itens: string[], porColuna: number) {
  return itens.length > porColuna && itens.every((i) => i.length <= 22);
}

/** Altura de uma `Lista` — a coluna mais alta das duas, quando ela se divide. */
function alturaDaLista(itens: string[], n: number, largura: number, porColuna: number, contagem = false) {
  const duas = cabeEmDuas(itens, porColuna);
  const w = larguraDoNome(duas ? largura / 2 - 14 : largura, n, contagem);
  const meio = Math.ceil(itens.length / 2);
  const somar = (arr: string[]) => arr.reduce((s, t) => s + linhasDeTexto(t, n, w) * n * 1.15 + 2, 0);
  return (duas ? Math.max(somar(itens.slice(0, meio)), somar(itens.slice(meio))) : somar(itens)) * FOLGA;
}

// Lista NUMERADA a partir de `inicio`; passando de `porColuna` itens, divide
// em duas colunas em vez de rolar. O número fica em destaque, na cor do bloco.
function Lista({ itens, inicio, cor, tamanho, porColuna = 6, compacto = false, contagem }: { itens: string[]; inicio: number; cor: string; tamanho: number; porColuna?: number; compacto?: boolean; contagem?: Record<string, number> }) {
  const duas = cabeEmDuas(itens, porColuna);
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
              <li key={j} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: vh(tamanho), lineHeight: compacto ? 1.15 : 1.22, fontWeight: 700, color: TV.texto, padding: compacto ? "1px 0" : "2px 0", overflowWrap: "anywhere" }}>
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

// ---------------------------------------------------------------------------
// O BUFFET EM DUAS COLUNAS CORRIDAS
//
// Antes cada grupo era uma lista sua, e cada uma se dividia (ou não) em duas
// colunas por conta própria: as proteínas ocupavam meia largura e a outra
// metade ficava preta, e o mesmo embaixo. Agora o bloco inteiro é UMA lista
// que desce a primeira coluna e continua na segunda, com os subtítulos
// correndo junto. Enche a tela dos dois lados, e é o que deixa a letra crescer.
// ---------------------------------------------------------------------------
type LinhaBuffet = { tipo: "titulo"; texto: string } | { tipo: "item"; n: number; nome: string };

function linhasDoBuffet(grupos: { titulo: string; itens: string[] }[]) {
  const linhas: LinhaBuffet[] = [];
  let n = 1;
  for (const g of grupos) {
    if (g.itens.length === 0) continue;
    linhas.push({ tipo: "titulo", texto: g.titulo });
    for (const nome of g.itens) linhas.push({ tipo: "item", n: n++, nome });
  }
  return linhas;
}

function emDuasColunas(linhas: LinhaBuffet[]) {
  let corte = Math.ceil(linhas.length / 2);
  // Subtítulo sozinho no pé da coluna fica órfão: desce junto com o grupo.
  if (linhas[corte - 1]?.tipo === "titulo") corte -= 1;
  return [linhas.slice(0, corte), linhas.slice(corte)];
}

function alturaDaColunaDoBuffet(col: LinhaBuffet[], n: number) {
  let h = 0;
  for (const l of col) {
    if (l.tipo === "titulo") h += Math.max(15, n * 0.52) * 1.35 + n * 0.32;
    else h += linhasDeTexto(l.nome, n, larguraDoNome(LARGURA_DO_BUFFET, n)) * n * 1.2 + 2;
  }
  return h * FOLGA;
}

function ColunaDoBuffet({ linhas, tamanho }: { linhas: LinhaBuffet[]; tamanho: number }) {
  return (
    <ol style={{ flex: 1, minWidth: 0, listStyle: "none", margin: 0, padding: 0 }}>
      {linhas.map((l, i) =>
        l.tipo === "titulo" ? (
          <li key={`t${i}`} style={{ fontSize: vh(Math.max(15, Math.round(tamanho * 0.52))), fontWeight: 900, letterSpacing: "0.16em", color: TV.fraco, marginTop: i === 0 ? 0 : Math.round(tamanho * 0.32), marginBottom: 1 }}>
            {l.texto.toUpperCase()}
          </li>
        ) : (
          <li key={`i${i}`} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: vh(tamanho), lineHeight: 1.2, fontWeight: 700, color: TV.texto, padding: "1px 0", overflowWrap: "anywhere" }}>
            <span style={{ minWidth: "1.5em", textAlign: "right", color: TV.laranja, fontWeight: 900, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{l.n}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{l.nome}</span>
          </li>
        ),
      )}
    </ol>
  );
}

function Subtitulo({ texto }: { texto: string }) {
  return <div style={{ fontSize: vh(17), fontWeight: 900, letterSpacing: "0.16em", color: TV.fraco, marginBottom: 1, marginTop: 2 }}>{texto.toUpperCase()}</div>;
}

// AS DATAS QUE VÊM AÍ
//
// "No dia 12 a gente abre?" é a pergunta que a equipe faz toda semana, e a
// resposta morria na conversa com o Rafael. Agora ela fica escrita na parede.
// Duas datas bastam: a terceira já é longe demais pra alguém guardar.
function Datas({ feriados, tamanho, hoje }: { feriados: Feriado[]; tamanho: number; hoje: string }) {
  // `proximos` tira as datas soltas que caem dentro de um período: durante as
  // férias coletivas, "25/12 Natal FECHA" não acrescenta nada a "fechado até
  // 02/01", e gastaria a outra linha.
  const lista = proximos(feriados, hoje, 120, 2);
  if (lista.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {lista.map((f) => {
        const s = SITUACAO[f.situacao];
        return (
          <div key={f.id} style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: vh(tamanho), fontWeight: 700, color: TV.suave }}>
            <span style={{ color: TV.texto, fontWeight: 900, whiteSpace: "nowrap", flexShrink: 0 }}>{rotuloDaData(f)}</span>
            <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{f.nome}</span>
            {/* A decisão em caixa alta, na cor dela: é a única coisa que
                precisa ser lida do outro lado da cozinha. */}
            <span style={{ color: s.cor, fontWeight: 900, letterSpacing: "0.08em", whiteSpace: "nowrap", flexShrink: 0 }}>
              {s.curto}
            </span>
            {f.detalhe && <span style={{ color: TV.fraco, whiteSpace: "nowrap", flexShrink: 0 }}>{f.detalhe}</span>}
          </div>
        );
      })}
    </div>
  );
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
        <div key={r.id} style={{ background: TV.recadoFundo, borderLeft: `12px solid ${TV.laranja}`, borderRadius: 14, padding: "8px 16px", fontSize: vh(recados.length > 1 ? 22 : 26), lineHeight: 1.2, fontWeight: 800, color: TV.texto, overflowWrap: "anywhere" }}>
          {r.texto}
        </div>
      ))}
      {(compacto ? hoje.length > 0 : aniversariantes.length > 0) && (
        <div>
          {!compacto && <div style={{ fontSize: vh(16), fontWeight: 900, letterSpacing: "0.16em", color: TV.fraco }}>ANIVERSARIANTES DE {MESES[mes - 1].toUpperCase()}</div>}
          {hoje.length > 0 && (
            <div style={{ marginTop: 4, background: TV.laranja, borderRadius: 12, padding: "6px 16px", fontSize: vh(28), fontWeight: 900, color: TV.fundo }}>
              HOJE: {hoje.map((a) => a.nome).join(", ")} — parabéns!
            </div>
          )}
          {outros.length > 0 && (
            <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {outros.map((a) => (
                <div key={a.nome + a.dia} style={{ background: TV.fundo, border: `2px solid ${TV.borda}`, borderRadius: 10, padding: "3px 10px", fontSize: vh(20), fontWeight: 700, color: TV.suave, whiteSpace: "nowrap" }}>
                  <span style={{ color: TV.laranja, fontVariantNumeric: "tabular-nums" }}>{String(a.dia).padStart(2, "0")}</span> {a.nome}
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
    <div style={{ border: `3px solid ${TV.atencao}`, borderRadius: 16, background: TV.atencaoFundo, padding: cheio ? "18px 28px 22px" : "10px 18px 12px", ...(cheio ? { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0 } : {}) }}>
      <div style={{ fontSize: vh(cheio ? 34 : 26), fontWeight: 900, letterSpacing: "0.12em", color: TV.atencao, marginBottom: cheio ? 14 : 6 }}>{titulo}</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {itens.map((a, i) => (
          <li key={a.id} style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: vh(tamanho), lineHeight: 1.22, fontWeight: 700, color: TV.texto, padding: cheio ? "6px 0" : "3px 0", overflowWrap: "anywhere" }}>
            <span style={{ minWidth: "1.4em", textAlign: "right", color: TV.atencao, fontWeight: 900, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{i + 1}</span>
            <span>
              {a.setor && <span style={{ color: TV.areia, fontWeight: 900, letterSpacing: "0.08em", marginRight: 10 }}>{a.setor.toUpperCase()}</span>}
              {a.texto}
              {a.pessoa && <span style={{ color: TV.fraco, fontWeight: 700 }}> — {a.pessoa}</span>}
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
        <span key={i} style={{ width: i === pagina ? 14 : 10, height: i === pagina ? 14 : 10, borderRadius: 7, background: i === pagina ? TV.laranja : TV.borda, display: "inline-block" }} />
      ))}
    </span>
  );
}

// A tela inteira: cabeçalho com hora; CARDÁPIO DO DIA + avisos à esquerda (3/5);
// MARMITAS em cima e SALADAS embaixo à direita (2/5).
export function TvPaginaCardapio({
  cardapio: c, agora, recados, temperatura, aniversariantes, piscar, apontamentos = [], pagina = 0, feriados = [],
}: {
  cardapio: CardapioTv; agora: number; recados: RecadoTv[]; temperatura: number | null; aniversariantes: AniversarianteTv[]; piscar: boolean;
  apontamentos?: ApontamentoTv[]; pagina?: number; feriados?: Feriado[];
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
  const compacto = naTela.length > 0;
  const linhasBuffet = b
    ? linhasDoBuffet([
        { titulo: "Proteínas", itens: b.proteinas },
        { titulo: "Acompanhamentos", itens: b.carboidratos },
        { titulo: "Especial do dia", itens: b.especial },
      ])
    : [];
  const [colunaA, colunaB] = emDuasColunas(linhasBuffet);
  // O que os avisos vão comer da altura antes de a lista começar a medir.
  const reservado =
    (feriados.length ? 30 + Math.min(feriados.length, 2) * 30 : 0) +
    (recados.length ? Math.min(recados.length, compacto ? 1 : 3) * 58 + 8 : 0) +
    (aniversariantes.length ? (compacto ? (aniversariantes.some((a) => a.hoje) ? 56 : 0) : 74) : 0) +
    (naTela.length ? 58 + naTela.length * 40 : 0);
  const tamBuffet = maiorQueCabe(
    (n) => Math.max(alturaDaColunaDoBuffet(colunaA, n), alturaDaColunaDoBuffet(colunaB, n)),
    ALTURA_DO_BUFFET - reservado,
    20,
    44,
  );

  const k = c.kern && !c.kern.bloqueado ? c.kern : null;
  const totalKern = k ? k.pratos.length + k.proteinas.length : 0;
  const saladas = c.saladas ?? [];
  const totalSal = saladas.reduce((s, g) => s + g.itens.length, 0);
  // A coluna da direita divide a altura entre marmitas e saladas: a letra é a
  // maior que faz os dois blocos juntos caberem.
  const tamDir = maiorQueCabe(
    (n) => {
      let h = 0;
      if (k) {
        if (k.pratos.length) h += ALTURA_DO_SUBTITULO + alturaDaLista(k.pratos, n, LARGURA_DA_DIREITA, 3, true);
        if (k.proteinas.length) h += ALTURA_DO_SUBTITULO + alturaDaLista(k.proteinas, n, LARGURA_DA_DIREITA, 4, true);
        if (k.porLoja.length) h += n * 1.25 + 6;
        if (k.salada) h += n * 1.25 + 4;
        if (k.saladaPorLoja.length) h += (n - 6) * 1.25;
      }
      for (const g of saladas) h += ALTURA_DO_SUBTITULO + alturaDaLista(g.itens, n, LARGURA_DA_DIREITA, 2) + 2;
      return h;
    },
    ALTURA_DA_DIREITA,
    15,
    26,
  );
  const mes = partesSP(agora).mes;
  const kernNome = (c.kern?.nomeConvenio || "Kern").toUpperCase();

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 28px 0", overflow: "hidden" }}>
      <Cabecalho dia={c.dia} agora={agora} temperatura={temperatura} piscar={piscar} />
      <div style={{ flex: 1, display: "flex", gap: 20, minHeight: 0, paddingBottom: 10 }}>
        {/* ===== CARDÁPIO DO DIA (buffet) ===== */}
        <Bloco
          titulo="CARDÁPIO DO DIA"
          cor={TV.laranja}
          style={{ flex: 3 }}
          extra={b && !b.publicado ? <span style={{ fontSize: vh(18), color: TV.areia, fontWeight: 700 }}>rascunho — ainda não publicado</span> : undefined}
        >
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {b && linhasBuffet.length > 0 ? (
              <div style={{ display: "flex", gap: 32 }}>
                <ColunaDoBuffet linhas={colunaA} tamanho={tamBuffet} />
                {colunaB.length > 0 && <ColunaDoBuffet linhas={colunaB} tamanho={tamBuffet} />}
              </div>
            ) : (
              <p style={{ fontSize: vh(30), fontWeight: 800, color: TV.fraco, margin: "12px 0" }}>Cardápio de {rotuloDiaLongo(c.dia)} ainda não cadastrado</p>
            )}
            <div style={{ marginTop: "auto" }}>
              {feriados.length > 0 && (
                <div style={{ paddingTop: 8, marginBottom: 6, borderTop: `2px solid ${TV.borda}` }}>
                  <div style={{ fontSize: vh(16), fontWeight: 900, letterSpacing: "0.16em", color: TV.fraco, marginBottom: 2, paddingTop: 6 }}>
                    PRÓXIMAS DATAS
                  </div>
                  {/* O dia de HOJE, e não o dia do cardápio: depois do corte
                      a tela já mostra o cardápio de amanhã, e usar essa data
                      esconderia um feriado que é hoje. */}
                  <Datas feriados={feriados} tamanho={22} hoje={hojeSp(agora)} />
                </div>
              )}
              <Avisos aniversariantes={aniversariantes} recados={recados} mes={mes} compacto={compacto} />
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
            cor={TV.areia}
            extra={k ? <span style={{ fontSize: vh(22), fontWeight: 900, color: TV.texto, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{k.quantidade} un · saem {k.horaEntrega}</span> : undefined}
          >
            {c.kern?.bloqueado ? (
              <p style={{ fontSize: vh(24), fontWeight: 700, color: TV.suave, margin: 0 }}>Sem marmita hoje — {c.kern.bloqueado}</p>
            ) : !k || totalKern === 0 ? (
              <p style={{ fontSize: vh(22), fontWeight: 700, color: TV.fraco, margin: 0 }}>Cardápio da marmita ainda não cadastrado</p>
            ) : (
              <>
                {/* Quantas viandas vão pra cada loja. A cozinha embala por
                    destino, e o total sozinho ("14 un") não diz quantas caixas
                    fechar nem de que tamanho. */}
                {k.porLoja.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0 20px", marginBottom: 6, fontSize: vh(tamDir), fontWeight: 800, color: TV.texto }}>
                    <span style={{ color: TV.fraco, letterSpacing: "0.12em", fontSize: vh(16), fontWeight: 900, flexShrink: 0 }}>POR LOJA</span>
                    {k.porLoja.map((x) => (
                      <span key={x.loja} style={{ whiteSpace: "nowrap" }}>
                        {x.loja} <span style={{ color: TV.areia, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{x.n}</span>
                      </span>
                    ))}
                  </div>
                )}
                {k.pratos.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <Subtitulo texto="Pratos" />
                    <Lista itens={k.pratos} inicio={1} cor={TV.areia} tamanho={tamDir} porColuna={3} compacto contagem={k.escolhas} />
                  </div>
                )}
                {k.proteinas.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <Subtitulo texto="Proteínas (escolhe uma)" />
                    <Lista itens={k.proteinas} inicio={k.pratos.length + 1} cor={TV.areia} tamanho={tamDir} porColuna={4} compacto contagem={k.escolhas} />
                  </div>
                )}
                {k.salada && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: vh(tamDir - 2), fontWeight: 700, color: TV.suave }}>
                    <span style={{ color: TV.fraco, letterSpacing: "0.12em", fontSize: vh(16), fontWeight: 900, flexShrink: 0 }}>SALADA</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{k.salada}</span>
                    {/* Aqui o número quer dizer QUANTOS LEVARAM: a salada do
                        dia é uma só, e quem não quis não escolhe outra. */}
                    <span style={{ flexShrink: 0, minWidth: "2.2em", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 900, color: k.escolhas[k.salada.trim().toLowerCase()] ? TV.areia : "transparent" }}>
                      {k.escolhas[k.salada.trim().toLowerCase()] ?? 0}
                    </span>
                  </div>
                )}
                {/* A divisão por loja, numa linha própria embaixo: a cozinha
                    embala por destino, então o total sozinho não basta. Fica
                    recuado até onde começa o nome da salada, pra leitura
                    descer em coluna. */}
                {k.saladaPorLoja.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0 18px", paddingLeft: "5.2em", marginTop: 1, fontSize: vh(tamDir - 6), fontWeight: 700, color: TV.fraco }}>
                    {k.saladaPorLoja.map((x) => (
                      <span key={x.loja} style={{ whiteSpace: "nowrap" }}>
                        {x.loja} <span style={{ color: TV.areia, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{x.n}</span>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </Bloco>

          {/* ===== SALADAS ===== */}
          <Bloco titulo="SALADAS" cor={TV.verde} style={{ flex: 1 }} extra={totalSal > 0 ? <span style={{ fontSize: vh(20), fontWeight: 800, color: TV.fraco }}>{totalSal} no buffet</span> : undefined}>
            {saladas.length === 0 ? (
              <p style={{ fontSize: vh(22), fontWeight: 700, color: TV.fraco, margin: 0 }}>Saladas de {rotuloDiaLongo(c.dia)} ainda não marcadas</p>
            ) : (
              (() => {
                let inicio = 1;
                return saladas.map((g) => {
                  const ini = inicio; inicio += g.itens.length;
                  return (
                    <div key={g.categoria} style={{ marginBottom: 2 }}>
                      <Subtitulo texto={g.categoria} />
                      <Lista itens={g.itens} inicio={ini} cor={TV.verde} tamanho={tamDir} porColuna={2} compacto />
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
