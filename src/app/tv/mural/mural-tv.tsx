import { DIAS, GRUPOS } from "@/lib/folgas";
import type { FolgaMural, PedidoCompraMural } from "@/app/(painel)/mural/mural";

// O MURAL PARA O NAVEGADOR DE UMA TV
//
// A tela do painel é escrita em Tailwind, que pede um navegador dos últimos
// anos. O aparelho de Android TV do escritório não é: ele recebeu o texto certo
// e jogou tudo numa lista sem formato, encavalada e cortada na borda.
//
// Então a TV ganha a sua própria versão, escrita como se fosse 2010: estilo
// colado em cada elemento (nada de folha de estilo), caixas em flex, nenhum
// JavaScript. É a mesma saída que a TV da cozinha já usa no "modo simples".
//
// O tamanho vem em `vw` — "por cento da largura da tela". É o que faz o mural
// encher qualquer TV, de 32" a 50", sem ninguém medir nada: quem faz a conta é
// o próprio navegador, e até os antigos sabem fazer essa.

const FUNDO = "#211915";
const CARTAO = "#2b211b";
const BORDA = "#3d2f26";
const TEXTO = "#e8ded5";
const FRACO = "#9b8878";
const LARANJA = "#C78340";
const CREME = "#ece3da";
const ATENCAO = "#e0a04a";

/** De quanto em quanto tempo a TV se recarrega sozinha, em segundos. Sem
 *  JavaScript: é a própria página que pede pro navegador voltar a buscá-la. */
export const RECARREGA_SEG = 60;

function corDoGrupo(grupo: string) {
  return (GRUPOS as Record<string, { cor: string } | undefined>)[grupo]?.cor ?? FRACO;
}

const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function diasEntre(de: string, ate: string) {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((+new Date(a2, m2 - 1, d2) - +new Date(a1, m1 - 1, d1)) / 86400000);
}

function espera(iso: string | null, hoje: string) {
  if (!iso) return "";
  const n = diasEntre(iso.slice(0, 10), hoje);
  if (n <= 0) return "hoje";
  if (n === 1) return "ontem";
  return `há ${n} dias`;
}

export function MuralTv({
  folgas,
  solicitacoes,
  hoje,
  ajuste = 1,
}: {
  folgas: FolgaMural[];
  solicitacoes: PedidoCompraMural[];
  hoje: string;
  /** Empurrãozinho pra letra: 1 é o tamanho calculado, 1.2 aumenta 20%. */
  ajuste?: number;
}) {
  // Tudo que mede letra passa por aqui, pra o ?tamanho= do endereço valer na
  // tela inteira de uma vez.
  const t = (vw: number) => `${(vw * ajuste).toFixed(2)}vw`;

  const todosPendentes = folgas.filter((f) => f.status === "Pendente");
  const todosAbertos = solicitacoes.filter((s) => s.status === "pendente");
  const esperando = todosPendentes.length + todosAbertos.length;
  const pendentes = todosPendentes.slice(0, 4);
  const abertos = todosAbertos.slice(0, 4);

  const porDia = new Map<string, FolgaMural[]>();
  for (const f of folgas) {
    if (f.status !== "Aprovado" || f.data < hoje) continue;
    const lista = porDia.get(f.data) ?? [];
    lista.push(f);
    porDia.set(f.data, lista);
  }
  const dias = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const mostrados = dias.slice(0, 9);

  const hora = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  const caixaDoPedido = {
    background: "rgba(33,25,21,0.08)",
    borderRadius: "0.6vw",
    padding: "0.8vw 1vw",
    marginBottom: "0.6vw",
  };

  return (
    <div
      style={{
        // Preso na tela em vez de seguir o fluxo da página: sem a folha de
        // estilo do sistema (que o navegador da TV não aplica), o <body> volta
        // a ter a margem de fábrica e empurraria tudo, criando barra de
        // rolagem numa tela que ninguém rola.
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        background: FUNDO,
        color: TEXTO,
        fontFamily: "system-ui, -apple-system, Roboto, Arial, sans-serif",
        padding: "2vw",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* A TV se atualiza pedindo a própria página de novo. Sem isto ela ficaria
          parada no que estava quando alguém ligou o aparelho. */}
      <meta httpEquiv="refresh" content={String(RECARREGA_SEG)} />

      {/* ---------- Cabeçalho ---------- */}
      <div style={{ display: "flex", alignItems: "flex-end", marginBottom: "1.6vw" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: t(2.5), fontWeight: 700, lineHeight: 1.1 }}>Mural do escritório</div>
          <div style={{ fontSize: t(1.2), color: FRACO, marginTop: "0.4vw" }}>
            O que a equipe pediu e está esperando resposta.
          </div>
        </div>
        <div style={{ fontSize: t(1.2), color: FRACO }}>atualiza sozinho · {hora}</div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* ---------- 1. Esperando você ---------- */}
        <div
          style={{
            width: "34%",
            boxSizing: "border-box",
            background: CREME,
            color: FUNDO,
            borderRadius: "1vw",
            padding: "1.6vw",
            marginRight: "1.4vw",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: t(1.2), opacity: 0.7 }}>Esperando você</div>
          <div style={{ fontSize: t(5.5), fontWeight: 700, lineHeight: 1.05 }}>{esperando}</div>

          {esperando === 0 ? (
            <div style={{ fontSize: t(1.3), opacity: 0.75, marginTop: "1vw" }}>
              Nada esperando resposta.
            </div>
          ) : (
            <div style={{ marginTop: "1vw" }}>
              {pendentes.map((f) => (
                <div key={`f${f.id}`} style={caixaDoPedido}>
                  <div style={{ fontSize: t(1.5), fontWeight: 700 }}>{f.nome} quer folga</div>
                  <div style={{ fontSize: t(1.15), opacity: 0.75 }}>
                    {DIAS[new Date(`${f.data}T12:00:00`).getDay()]}, {diaCurto(f.data)}
                    {f.criadoEm ? ` · pediu ${espera(f.criadoEm, hoje)}` : ""}
                  </div>
                </div>
              ))}
              {abertos.map((s) => (
                <div key={`c${s.id}`} style={caixaDoPedido}>
                  <div style={{ fontSize: t(1.5), fontWeight: 700 }}>
                    {s.item}
                    {s.urgente ? " — URGENTE" : ""}
                  </div>
                  <div style={{ fontSize: t(1.15), opacity: 0.75 }}>
                    {s.nome}
                    {s.quantidade ? ` · ${s.quantidade}` : ""}
                    {s.criadoEm ? ` · pediu ${espera(s.criadoEm, hoje)}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---------- 2. Folgas que vêm aí ---------- */}
        <div
          style={{
            flex: 1,
            boxSizing: "border-box",
            background: CARTAO,
            borderRadius: "1vw",
            padding: "1.4vw",
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: t(1.2), color: FRACO, marginBottom: "0.8vw" }}>
            Folgas aprovadas · próximos 45 dias
          </div>

          {mostrados.length === 0 ? (
            <div style={{ fontSize: t(1.4), color: FRACO }}>Nenhuma folga marcada pra frente.</div>
          ) : (
            mostrados.map(([data, lista]) => {
              const falta = diasEntre(hoje, data);
              const semGerente = lista.some((f) => f.gerente);
              return (
                <div
                  key={data}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    borderBottom: `1px solid ${BORDA}`,
                    padding: "0.55vw 0",
                  }}
                >
                  <div style={{ width: "22%", fontSize: t(1.5), fontWeight: 700 }}>
                    {DIAS[new Date(`${data}T12:00:00`).getDay()]}, {diaCurto(data)}
                  </div>
                  <div style={{ width: "16%", fontSize: t(1.15), color: FRACO }}>
                    {falta === 0 ? "hoje" : falta === 1 ? "amanhã" : `em ${falta} dias`}
                  </div>
                  <div style={{ flex: 1, fontSize: t(1.35) }}>
                    {lista.map((f, i) => (
                      <span key={f.id} style={{ whiteSpace: "nowrap" }}>
                        {i > 0 ? <span style={{ color: BORDA }}> · </span> : null}
                        <span style={{ color: corDoGrupo(f.grupo) }}>●</span> {f.nome.split(" ")[0]}
                        {f.gerente ? " (ger.)" : ""}
                      </span>
                    ))}
                    {semGerente ? (
                      <span
                        style={{
                          color: ATENCAO,
                          fontWeight: 700,
                          marginLeft: "0.8vw",
                          whiteSpace: "nowrap",
                        }}
                      >
                        sem gerente
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}

          {dias.length > mostrados.length ? (
            <div style={{ fontSize: t(1.15), color: FRACO, marginTop: "0.8vw" }}>
              e mais {dias.length - mostrados.length} dia(s) com folga marcada
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ fontSize: t(1), color: BORDA, marginTop: "0.8vw", textAlign: "right" }}>
        <span style={{ color: LARANJA }}>Brasa</span> · mural
      </div>
    </div>
  );
}
