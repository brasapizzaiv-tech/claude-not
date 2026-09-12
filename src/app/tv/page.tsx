import type { Metadata, Viewport } from "next";
import { RodizioCard } from "@/components/rodizio-card";
import { CARDS_POR_COLUNA, filaVisivel, separarColunas, type PedidoRodizio } from "@/lib/rodizio";
import { agoraMs, chaveTvOk, filaTv, recadosTv, temperaturaIvoti } from "@/lib/rodizio-server";
import { TvRelogio, type RecadoTv } from "@/components/tv-relogio";
import { TvClient } from "./tv-client";

// TV da cozinha: tela cheia, sem menu. A chave da URL é conferida no servidor
// antes de renderizar qualquer coisa; sem ela a página nem carrega a fila.
//
// Dois modos:
//  - normal: a fila já vem renderizada do servidor e o navegador segue
//    atualizando sozinho a cada 3 s (TvClient).
//  - simples (?modo=simples): só HTML, a página inteira recarrega a cada 5 s.
//    É pra navegador de TV antigo (LG webOS etc.), que não roda o código
//    moderno do site — nele o modo normal fica parado em "Nenhum pedido".
//    O modo normal detecta isso: se em 8 s o código não ligou, a própria
//    página pula pro modo simples (script minúsculo em JavaScript antigo).
export const metadata: Metadata = { title: "Rodízio · Cozinha", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, userScalable: false, themeColor: "#0b0b0b" };
export const dynamic = "force-dynamic";

const SIMPLES_INTERVALO_SEG = 5;
const FALLBACK_MS = 8000;

export default async function TvPage({ searchParams }: { searchParams: Promise<{ chave?: string; modo?: string }> }) {
  const { chave = "", modo = "" } = await searchParams;
  const { configurada, ok } = chaveTvOk(chave);

  if (!ok) {
    return (
      <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "#888", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 32 }}>
        <div>
          <p style={{ fontSize: 28, fontWeight: 800, color: "#ccc" }}>Quadro do rodízio</p>
          <p style={{ marginTop: 8, fontSize: 18 }}>
            {configurada ? "Endereço incompleto: abra o link com a chave (…/tv?chave=…)." : "Falta configurar RODIZIO_TV_CHAVE no servidor."}
          </p>
        </div>
      </div>
    );
  }

  let inicial: PedidoRodizio[] = [];
  let recados: RecadoTv[] = [];
  let falhou = false;
  try { [inicial, recados] = await Promise.all([filaTv(), recadosTv()]); } catch { falhou = true; }
  const temperatura = await temperaturaIvoti();
  const agora = agoraMs();

  if (modo === "simples") return <TvSimples pedidos={inicial} agora={agora} semRede={falhou} recados={recados} temperatura={temperatura} />;

  // Script em JavaScript "antigo" de propósito (sem let/const/arrow): precisa
  // rodar justamente no navegador que NÃO consegue rodar o resto.
  const fallback =
    `setTimeout(function(){if(!window.__tvOk){var u=location.pathname+location.search;` +
    `location.replace(u+(u.indexOf("?")>-1?"&":"?")+"modo=simples");}},${FALLBACK_MS});`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: fallback }} />
      <TvClient chave={chave} inicial={inicial} agoraInicial={agora} recadosInicial={recados} temperaturaInicial={temperatura} />
    </>
  );
}

// Modo simples: a mesma tela, sem JavaScript. O tempo de espera e o relógio
// são calculados no servidor a cada recarga.
function TvSimples({ pedidos, agora, semRede, recados, temperatura }: { pedidos: PedidoRodizio[]; agora: number; semRede: boolean; recados: RecadoTv[]; temperatura: number | null }) {
  const fila = filaVisivel(pedidos, agora);
  const { salgadas, doces } = separarColunas(fila);
  const hora = new Date(agora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "#fff", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <meta httpEquiv="refresh" content={String(SIMPLES_INTERVALO_SEG)} />
      {fila.length === 0 ? (
        <TvRelogio agora={agora} recados={recados} temperatura={temperatura} piscar={false} />
      ) : (
        <div style={{ flex: 1, display: "flex", padding: "20px 24px 0" }}>
          <ColunaSimples titulo="SALGADAS" cor="#C78340" lista={salgadas} agora={agora} />
          <ColunaSimples titulo="DOCES" cor="#f472b6" lista={doces} agora={agora} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 24px 14px", fontSize: 20, color: "#777" }}>
        <span>Brasa · Rodízio</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: semRede ? "#ef4444" : "#22c55e", display: "inline-block" }} />
          {semRede && <span style={{ color: "#ef4444", fontWeight: 700 }}>SEM CONEXÃO</span>}
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#aaa" }}>{hora}</span>
        </span>
      </div>
    </div>
  );
}

function ColunaSimples({ titulo, cor, lista, agora }: { titulo: string; cor: string; lista: PedidoRodizio[]; agora: number }) {
  const visiveis = lista.slice(0, CARDS_POR_COLUNA);
  const resto = lista.length - visiveis.length;
  return (
    <div style={{ flex: 1, width: "50%", display: "flex", flexDirection: "column", minHeight: 0, padding: "0 12px" }}>
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: "0.12em", color: cor }}>{titulo}</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: "#777", marginLeft: 12 }}>{lista.length}</span>
      </div>
      <div>
        {visiveis.map((p) => <div key={p.id} style={{ marginBottom: 12 }}><RodizioCard p={p} agora={agora} /></div>)}
      </div>
      {resto > 0 && <div style={{ marginTop: 12, textAlign: "center", fontSize: 26, fontWeight: 800, color: cor }}>+{resto} na fila</div>}
    </div>
  );
}
