// Página do DELIVERY na TV da cozinha (alterna com o cardápio). Desenhada num
// projeto de 1920×1080 e medida em vh, como as outras TVs (tv-cores.ts). Estilo
// colado no elemento: o navegador da TV não roda o CSS do painel.
import { TV } from "@/lib/tv-cores";
import type { DeliveryTv, PedidoTv } from "@/lib/delivery-tv";

const vh = (n: number) => `${(n / 10.8).toFixed(2)}vh`;

function hhmm(agora: number) {
  return new Date(agora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}
const tempo = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`);

function Card({ rotulo, valor, cor, linha }: { rotulo: string; valor: string; cor: string; linha?: string | null }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: TV.bloco, border: `2px solid ${TV.borda}`, borderRadius: 18, padding: `${vh(14)} ${vh(20)}` }}>
      <div style={{ fontSize: vh(22), fontWeight: 800, letterSpacing: "0.08em", color: TV.fraco, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rotulo}</div>
      <div style={{ fontSize: vh(74), lineHeight: 1.05, fontWeight: 900, color: cor, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{valor}</div>
      {linha && <div style={{ fontSize: vh(22), fontWeight: 700, color: TV.suave, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{linha}</div>}
    </div>
  );
}

const quem = (p: PedidoTv) => `#${p.numero ?? "—"} · ${p.nome.split(/\s+/).slice(0, 2).join(" ")}`;

export function TvPaginaDelivery({ d, agora }: { d: DeliveryTv; agora: number }) {
  const bateu = d.meta != null && d.contador >= d.meta;
  const pct = d.meta ? Math.min(100, Math.round((d.contador / d.meta) * 100)) : 0;
  const total = d.entrega + d.retirada;
  const atrasados = d.atrasados.slice(0, 5);
  const compacto = atrasados.length > 0;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: `${vh(12)} ${vh(28)} 0`, overflow: "hidden", gap: vh(14) }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `3px solid ${TV.laranja}`, paddingBottom: vh(4) }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: vh(22) }}>
          <span style={{ fontSize: vh(34), fontWeight: 900, letterSpacing: "0.1em", color: TV.laranja }}>BRASA</span>
          <span style={{ fontSize: vh(34), fontWeight: 800, letterSpacing: "0.06em", color: TV.suave }}>DELIVERY · {d.turno === "almoco" ? "ALMOÇO" : "NOITE"}</span>
        </div>
        <span style={{ fontSize: vh(60), lineHeight: 1, fontWeight: 900, color: TV.texto, fontVariantNumeric: "tabular-nums" }}>{hhmm(agora)}</span>
      </div>

      {/* Contador + meta */}
      <div style={{ display: "flex", alignItems: "center", gap: vh(36), background: TV.bloco, border: `2px solid ${bateu ? TV.ok : TV.borda}`, borderRadius: 22, padding: `${vh(compacto ? 10 : 18)} ${vh(32)}` }}>
        <div style={{ textAlign: "center", minWidth: vh(330) }}>
          <div style={{ fontSize: vh(compacto ? 150 : 210), lineHeight: 0.95, fontWeight: 900, color: bateu ? TV.ok : TV.laranja, fontVariantNumeric: "tabular-nums" }}>{d.contador}</div>
          <div style={{ fontSize: vh(30), fontWeight: 800, color: TV.suave, letterSpacing: "0.06em" }}>{d.rotulo.toUpperCase()} HOJE</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {d.meta != null ? (
            <>
              <div style={{ fontSize: vh(44), fontWeight: 900, color: bateu ? TV.ok : TV.texto }}>
                {bateu ? `META BATIDA! ${d.meta} ${d.rotulo}` : `Meta: ${d.meta} ${d.rotulo} · faltam ${d.meta - d.contador}`}
              </div>
              <div style={{ marginTop: vh(14), height: vh(30), borderRadius: 999, background: TV.fundo, border: `2px solid ${TV.borda}`, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: bateu ? TV.ok : TV.laranja }} />
              </div>
            </>
          ) : (
            <div style={{ fontSize: vh(34), fontWeight: 700, color: TV.fraco }}>Meta do turno: defina em Delivery → Config</div>
          )}
          <div style={{ marginTop: vh(16), display: "flex", gap: vh(34), fontSize: vh(38), fontWeight: 800 }}>
            <span style={{ color: TV.info }}>Entrega {d.entrega}</span>
            <span style={{ color: TV.areia }}>Retirada {d.retirada}</span>
            <span style={{ color: TV.fraco }}>{total} pedido{total === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      {/* Indicadores */}
      <div style={{ display: "flex", gap: vh(16) }}>
        <Card rotulo="EM PRODUÇÃO" valor={String(d.emProducao)} cor={TV.texto} linha={d.emProducao ? "pedidos na cozinha" : "nada agora"} />
        <Card
          rotulo="MAIOR TEMPO NA COZINHA"
          valor={d.maiorCozinha ? tempo(d.maiorCozinha.min) : "—"}
          cor={d.maiorCozinha && d.maiorCozinha.min >= 40 ? TV.atraso : TV.texto}
          linha={d.maiorCozinha ? quem(d.maiorCozinha) : null}
        />
        <Card rotulo="MOTOBOYS NA RUA" valor={String(d.motoboysNaRua)} cor={TV.info} linha={`${d.pedidosNaRua} pedido${d.pedidosNaRua === 1 ? "" : "s"} em rota`} />
        <Card
          rotulo="ESPERANDO MOTOBOY"
          valor={d.esperaMotoboy ? tempo(d.esperaMotoboy.min) : "Nenhum"}
          cor={d.esperaMotoboy ? (d.esperaMotoboy.min >= 10 ? TV.atraso : TV.aviso) : TV.ok}
          linha={d.esperaMotoboy ? quem(d.esperaMotoboy) : "nenhum pedido pronto parado"}
        />
      </div>

      {/* Sem atraso: a ordem de saída (o que a cozinha faz primeiro). */}
      {atrasados.length === 0 && d.proximos.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, border: `2px solid ${TV.borda}`, borderRadius: 18, background: TV.bloco, padding: `${vh(8)} ${vh(22)}`, overflow: "hidden" }}>
          <div style={{ fontSize: vh(30), fontWeight: 900, color: TV.ok, letterSpacing: "0.06em" }}>PRÓXIMOS A SAIR · tudo no prazo</div>
          {d.proximos.slice(0, 6).map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: vh(18), marginTop: vh(6), fontSize: vh(36), fontWeight: 800, color: TV.texto, whiteSpace: "nowrap", overflow: "hidden" }}>
              <span style={{ color: TV.laranja, fontVariantNumeric: "tabular-nums", minWidth: vh(120) }}>{p.hora}</span>
              <span>{quem(p)}</span>
              {p.retirada && <span style={{ color: TV.areia, fontWeight: 800 }}>RETIRA</span>}
              <span style={{ color: TV.suave, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{p.itens}</span>
            </div>
          ))}
        </div>
      )}

      {/* Atrasados: não saiu pra entrega (ou não ficou pronto) no horário */}
      {atrasados.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, border: `3px solid ${TV.atraso}`, borderRadius: 18, background: TV.atencaoFundo, padding: `${vh(8)} ${vh(22)}`, overflow: "hidden" }}>
          <div style={{ fontSize: vh(30), fontWeight: 900, color: TV.atraso, letterSpacing: "0.06em" }}>
            ATRASADOS ({d.atrasados.length}) — ainda não saíram
          </div>
          {atrasados.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: vh(18), marginTop: vh(6), fontSize: vh(38), fontWeight: 800, color: TV.texto, whiteSpace: "nowrap", overflow: "hidden" }}>
              <span style={{ color: TV.atraso, fontVariantNumeric: "tabular-nums", minWidth: vh(150) }}>+{tempo(p.min)}</span>
              <span style={{ textDecoration: "underline", textDecorationThickness: 3, textUnderlineOffset: 6 }}>{quem(p)}</span>
              <span style={{ color: TV.suave, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{p.itens}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
