// Páginas de cardápio da TV da cozinha (buffet do dia, saladas, marmitas Kern)
// e a rotação entre elas. Sem hooks: desenhadas no servidor (modo simples) e
// no navegador (modo normal) do mesmo jeito.
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

function Cabecalho({ titulo, dia }: { titulo: string; dia: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24, marginBottom: 18, borderBottom: `3px solid ${LARANJA}`, paddingBottom: 10 }}>
      <span style={{ fontSize: vh(40), fontWeight: 900, letterSpacing: "0.1em", color: LARANJA }}>{titulo}</span>
      <span style={{ fontSize: vh(34), fontWeight: 800, color: "#ddd", letterSpacing: "0.06em" }}>{rotuloDia(dia)}</span>
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

// Lista grande; passando de `porColuna` itens, divide em duas colunas em vez de rolar.
function Lista({ itens, tamanho = 38, porColuna = 7 }: { itens: string[]; tamanho?: number; porColuna?: number }) {
  const duas = itens.length > porColuna;
  const meio = Math.ceil(itens.length / 2);
  const colunas = duas ? [itens.slice(0, meio), itens.slice(meio)] : [itens];
  return (
    <div style={{ display: "flex", gap: 40 }}>
      {colunas.map((col, i) => (
        <ul key={i} style={{ flex: 1, listStyle: "none", margin: 0, padding: 0 }}>
          {col.map((it, j) => (
            <li key={j} style={{ fontSize: vh(tamanho), lineHeight: 1.25, fontWeight: 700, color: "#fff", padding: "4px 0", overflowWrap: "anywhere" }}>
              <span style={{ color: LARANJA, marginRight: 14 }}>•</span>{it}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function Grupo({ titulo, itens, tamanho, porColuna }: { titulo: string; itens: string[]; tamanho?: number; porColuna?: number }) {
  if (itens.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: vh(22), fontWeight: 900, letterSpacing: "0.16em", color: "#888", marginBottom: 4 }}>{titulo.toUpperCase()}</div>
      <Lista itens={itens} tamanho={tamanho} porColuna={porColuna} />
    </div>
  );
}

export function TvPaginaBuffet({ c }: { c: CardapioTv }) {
  if (!c.buffet) return <NaoCadastrado titulo="CARDÁPIO DO DIA" dia={c.dia} />;
  const total = c.buffet.proteinas.length + c.buffet.carboidratos.length + c.buffet.especial.length;
  const tamanho = total > 14 ? 30 : total > 10 ? 34 : 38;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 32px 0", overflow: "hidden" }}>
      <Cabecalho titulo="CARDÁPIO DO DIA" dia={c.dia} />
      {!c.buffet.publicado && <div style={{ fontSize: vh(20), color: "#f59e0b", fontWeight: 700, marginBottom: 8 }}>rascunho — ainda não publicado no site</div>}
      <Grupo titulo="Proteínas" itens={c.buffet.proteinas} tamanho={tamanho} porColuna={5} />
      <Grupo titulo="Acompanhamentos" itens={c.buffet.carboidratos} tamanho={tamanho} porColuna={5} />
      <Grupo titulo="Especial do dia" itens={c.buffet.especial} tamanho={tamanho} porColuna={5} />
    </div>
  );
}

export function TvPaginaSaladas({ c }: { c: CardapioTv }) {
  if (!c.saladas || c.saladas.length === 0) return <NaoCadastrado titulo="SALADAS DO DIA" dia={c.dia} texto={`Saladas de ${rotuloDiaLongo(c.dia)} ainda não marcadas`} />;
  const total = c.saladas.reduce((s, g) => s + g.itens.length, 0);
  const tamanho = total > 18 ? 26 : total > 12 ? 30 : 34;
  // Categorias em duas colunas (só as que têm itens já vêm filtradas do servidor).
  const meio = Math.ceil(c.saladas.length / 2);
  const cols = c.saladas.length > 3 ? [c.saladas.slice(0, meio), c.saladas.slice(meio)] : [c.saladas];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 32px 0", overflow: "hidden" }}>
      <Cabecalho titulo="SALADAS DO DIA" dia={c.dia} />
      <div style={{ display: "flex", gap: 48 }}>
        {cols.map((col, i) => (
          <div key={i} style={{ flex: 1 }}>
            {col.map((g) => (
              <div key={g.categoria} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: vh(22), fontWeight: 900, letterSpacing: "0.16em", color: "#888", marginBottom: 2 }}>{g.categoria.toUpperCase()}</div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {g.itens.map((it) => (
                    <li key={it} style={{ fontSize: vh(tamanho), lineHeight: 1.25, fontWeight: 700, color: "#fff", padding: "3px 0" }}>
                      <span style={{ color: "#4ade80", marginRight: 14 }}>•</span>{it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TvPaginaKern({ c }: { c: CardapioTv }) {
  const k = c.kern;
  const titulo = `MARMITAS ${(k?.nomeConvenio || "KERN").toUpperCase()}`;
  if (!k) return <NaoCadastrado titulo={titulo} dia={c.dia} />;
  if (k.bloqueado) return <NaoCadastrado titulo={titulo} dia={c.dia} texto={`Sem marmita em ${rotuloDiaLongo(c.dia)} — ${k.bloqueado}`} />;
  if (k.pratos.length === 0 && k.proteinas.length === 0) return <NaoCadastrado titulo={titulo} dia={c.dia} texto={`Cardápio ${k.nomeConvenio} de ${rotuloDiaLongo(c.dia)} ainda não cadastrado`} />;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 32px 0", overflow: "hidden" }}>
      <Cabecalho titulo={titulo} dia={c.dia} />
      <div style={{ display: "flex", gap: 40 }}>
        <div style={{ flex: 1 }}>
          <Grupo titulo="Pratos" itens={k.pratos} tamanho={34} porColuna={99} />
          <Grupo titulo="Proteínas" itens={k.proteinas} tamanho={34} porColuna={99} />
          {k.salada && <Grupo titulo="Salada" itens={[k.salada]} tamanho={34} porColuna={99} />}
        </div>
        {/* quantidade e horário de saída em destaque */}
        <div style={{ width: 380, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#3a2410", borderLeft: `14px solid ${LARANJA}`, borderRadius: 16, padding: "18px 22px" }}>
            <div style={{ fontSize: vh(20), fontWeight: 800, letterSpacing: "0.12em", color: "#ffd9a8" }}>MARMITAS PEDIDAS</div>
            <div style={{ fontSize: vh(96), lineHeight: 1, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{k.quantidade}</div>
          </div>
          <div style={{ background: "#0f2740", borderLeft: "14px solid #3b82f6", borderRadius: 16, padding: "18px 22px" }}>
            <div style={{ fontSize: vh(20), fontWeight: 800, letterSpacing: "0.12em", color: "#bfdbfe" }}>SAEM ÀS</div>
            <div style={{ fontSize: vh(72), lineHeight: 1, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{k.horaEntrega}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Três pontinhos (ou quatro) no rodapé: em qual página está.
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
  const qual = TV_PAGINAS[pagina] ?? "buffet";
  return (
    <div key={qual} style={{ flex: 1, display: "flex", flexDirection: "column", animation: "tvFade 0.6s ease-out" }}>
      <style>{`@keyframes tvFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
      {qual === "buffet" && <TvPaginaBuffet c={cardapio} />}
      {qual === "saladas" && <TvPaginaSaladas c={cardapio} />}
      {qual === "kern" && <TvPaginaKern c={cardapio} />}
      {qual === "relogio" && <TvRelogio agora={agora} recados={recados} temperatura={temperatura} aniversariantes={aniversariantes} piscar={piscar} />}
    </div>
  );
}
