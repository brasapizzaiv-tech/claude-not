// Páginas de cardápio da TV da cozinha e a rotação entre elas. Sem hooks:
// desenhadas no servidor (modo simples) e no navegador (modo normal) do mesmo jeito.
//
// Uma página só de cardápio: buffet + saladas lado a lado, e as marmitas Kern
// embutidas — o prato do buffet que também vai na marmita ganha o selo "M";
// o que a marmita tem de diferente do buffet aparece no quadro "Extra marmitas".
import { rotuloDia, rotuloDiaLongo, TV_PAGINAS } from "@/lib/dia-cardapio";
import { TvRelogio, type AniversarianteTv, type RecadoTv } from "@/components/tv-relogio";

export type CardapioTv = {
  dia: string;                    // YYYY-MM-DD do cardápio que vale agora
  buffet: { proteinas: string[]; carboidratos: string[]; especial: string[]; publicado: boolean } | null;
  saladas: { categoria: string; itens: string[] }[] | null;
  kern: { pratos: string[]; proteinas: string[]; salada: string; quantidade: number; horaEntrega: string; nomeConvenio: string; bloqueado: string | null } | null;
};

const LARANJA = "#C78340";
// Tamanhos proporcionais à ALTURA da TV: o projeto é em px de 1080p e a TV de
// 32" (768p) mostra tudo a 71% — nada corta, nada rola.
const vh = (n: number) => `${(n / 10.8).toFixed(2)}vh`;

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

function Cabecalho({ titulo, dia }: { titulo: string; dia: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24, marginBottom: 14, borderBottom: `3px solid ${LARANJA}`, paddingBottom: 8 }}>
      <span style={{ fontSize: vh(38), fontWeight: 900, letterSpacing: "0.1em", color: LARANJA }}>{titulo}</span>
      <span style={{ fontSize: vh(32), fontWeight: 800, color: "#ddd", letterSpacing: "0.06em" }}>{rotuloDia(dia)}</span>
    </div>
  );
}

function NaoCadastrado({ titulo, dia, texto }: { titulo: string; dia: string; texto?: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 32px 0" }}>
      <Cabecalho titulo={titulo} dia={dia} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: vh(44), fontWeight: 800, color: "#666", textAlign: "center", maxWidth: 1100 }}>
          {texto ?? `Cardápio de ${rotuloDiaLongo(dia)} ainda não cadastrado`}
        </p>
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
function Lista({ itens, tamanho = 32, porColuna = 6, cor = LARANJA }: { itens: ItemTv[]; tamanho?: number; porColuna?: number; cor?: string }) {
  const duas = itens.length > porColuna;
  const meio = Math.ceil(itens.length / 2);
  const colunas = duas ? [itens.slice(0, meio), itens.slice(meio)] : [itens];
  return (
    <div style={{ display: "flex", gap: 32 }}>
      {colunas.map((col, i) => (
        <ul key={i} style={{ flex: 1, listStyle: "none", margin: 0, padding: 0 }}>
          {col.map((it, j) => (
            <li key={j} style={{ fontSize: vh(tamanho), lineHeight: 1.22, fontWeight: 700, color: "#fff", padding: "3px 0", overflowWrap: "anywhere" }}>
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
    <div style={{ marginBottom: 14 }}>
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

// A página única do cardápio: buffet à esquerda (2/3), saladas + extra marmitas à direita.
export function TvPaginaDia({ c }: { c: CardapioTv }) {
  if (!c.buffet && (!c.saladas || c.saladas.length === 0)) return <NaoCadastrado titulo="CARDÁPIO DO DIA" dia={c.dia} />;
  const x = cruzarKern(c);
  const totalBuffet = c.buffet ? c.buffet.proteinas.length + c.buffet.carboidratos.length + c.buffet.especial.length : 0;
  const tamBuffet = totalBuffet > 16 ? 28 : totalBuffet > 12 ? 31 : 34;
  const totalSal = x.saladas.reduce((s, g) => s + g.itens.length, 0);
  const tamSal = totalSal > 14 ? 23 : totalSal > 9 ? 26 : 29;
  const kernNome = (c.kern?.nomeConvenio || "Kern").toUpperCase();
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 32px 0", overflow: "hidden" }}>
      <Cabecalho titulo="CARDÁPIO DO DIA" dia={c.dia} />
      {c.buffet && !c.buffet.publicado && <div style={{ fontSize: vh(18), color: "#f59e0b", fontWeight: 700, marginBottom: 6 }}>rascunho — ainda não publicado no site</div>}
      <div style={{ flex: 1, display: "flex", gap: 40, minHeight: 0 }}>
        {/* Buffet */}
        <div style={{ flex: 3, minWidth: 0 }}>
          {x.buffet ? (
            <>
              <Grupo titulo="Proteínas" itens={x.buffet.proteinas} tamanho={tamBuffet} porColuna={6} />
              <Grupo titulo="Acompanhamentos" itens={x.buffet.carboidratos} tamanho={tamBuffet} porColuna={6} />
              <Grupo titulo="Especial do dia" itens={x.buffet.especial} tamanho={tamBuffet} porColuna={6} />
            </>
          ) : (
            <p style={{ fontSize: vh(30), fontWeight: 800, color: "#666" }}>Buffet de {rotuloDiaLongo(c.dia)} ainda não cadastrado</p>
          )}
        </div>
        {/* Saladas + marmitas */}
        <div style={{ flex: 2, minWidth: 0, display: "flex", flexDirection: "column", borderLeft: "2px solid #333", paddingLeft: 32 }}>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <div style={{ fontSize: vh(20), fontWeight: 900, letterSpacing: "0.16em", color: "#4ade80", marginBottom: 4 }}>SALADAS</div>
            {x.saladas.length === 0 ? (
              <p style={{ fontSize: vh(24), fontWeight: 700, color: "#666", margin: 0 }}>ainda não marcadas</p>
            ) : (
              x.saladas.map((g) => (
                <div key={g.categoria} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: vh(16), fontWeight: 900, letterSpacing: "0.14em", color: "#777" }}>{g.categoria.toUpperCase()}</div>
                  {/* muitas saladas → nomes na mesma linha, separados por ponto */}
                  {totalSal > 12 ? (
                    <div style={{ fontSize: vh(tamSal), lineHeight: 1.3, fontWeight: 700, color: "#fff" }}>
                      {g.itens.map((it, i) => (
                        <span key={i}>{i > 0 && <span style={{ color: "#4ade80", margin: "0 10px" }}>·</span>}{it.nome}{it.marmita && <SeloMarmita tamanho={tamSal} />}</span>
                      ))}
                    </div>
                  ) : (
                    <Lista itens={g.itens} tamanho={tamSal} porColuna={99} cor="#4ade80" />
                  )}
                </div>
              ))
            )}
          </div>
          {/* Extra marmitas */}
          <div style={{ marginTop: 10, marginBottom: 12, background: "#3a2410", borderLeft: `12px solid ${LARANJA}`, borderRadius: 14, padding: "12px 18px" }}>
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
                    <li key={i} style={{ fontSize: vh(26), lineHeight: 1.22, fontWeight: 800, color: "#fff", padding: "2px 0" }}>
                      <span style={{ color: LARANJA, marginRight: 12 }}>+</span>{e}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Pontinhos no rodapé: em qual página está.
export function TvPontos({ pagina }: { pagina: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      {TV_PAGINAS.map((_, i) => (
        <span key={i} style={{ width: i === pagina ? 14 : 10, height: i === pagina ? 14 : 10, borderRadius: 7, background: i === pagina ? LARANJA : "#444", display: "inline-block" }} />
      ))}
    </span>
  );
}

// Uma página da rotação. `key={pagina}` no chamador reinicia o fade.
export function TvPaginaCardapio({
  pagina, cardapio, agora, recados, temperatura, aniversariantes, piscar,
}: {
  pagina: number; cardapio: CardapioTv; agora: number; recados: RecadoTv[]; temperatura: number | null; aniversariantes: AniversarianteTv[]; piscar: boolean;
}) {
  const qual = TV_PAGINAS[pagina] ?? "cardapio";
  return (
    <div key={qual} style={{ flex: 1, display: "flex", flexDirection: "column", animation: "tvFade 0.6s ease-out" }}>
      <style>{`@keyframes tvFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
      {qual === "cardapio" && <TvPaginaDia c={cardapio} />}
      {qual === "relogio" && <TvRelogio agora={agora} recados={recados} temperatura={temperatura} aniversariantes={aniversariantes} piscar={piscar} />}
    </div>
  );
}
