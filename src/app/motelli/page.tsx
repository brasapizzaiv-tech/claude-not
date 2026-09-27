import { CONTATO_EMAIL, CORES, FONTE_TITULO } from "./marca";

// A vitrine. Diz o que o Motelli é com o vocabulário de quem tem restaurante:
// salão, comanda, caixa, entrega. Nada de promessa que o sistema não cumpre
// hoje — tudo que está aqui já roda na Brasa.
const AREAS: { titulo: string; texto: string }[] = [
  { titulo: "Salão e garçom", texto: "Comanda no celular do garçom, mesas, pizza meio a meio, rodízio com quadro na TV da cozinha." },
  { titulo: "Caixa e PDV", texto: "Recebe em dinheiro, Pix e cartão na maquininha integrada. Nota fiscal do consumidor sai sozinha." },
  { titulo: "Delivery", texto: "Pedidos num painel só, taxa por distância, entregadores com o app Motelli Entregador e acerto do dia." },
  { titulo: "Cozinha", texto: "Impressão por setor, cardápio do dia, marmitas por loja e avisos na TV: feriados, eventos, checklists." },
  { titulo: "Compras e estoque", texto: "Cotação com fornecedores pelo WhatsApp, conferência do que chegou contra a nota fiscal, contagem e CMV." },
  { titulo: "Equipe", texto: "Folgas, presença, 10% da noite, adiantamentos e compras internas, com o app de cada colaborador." },
  { titulo: "Financeiro e fiscal", texto: "Contas a pagar, fatura do cartão, DRE e as notas fiscais de compra puxadas direto da Receita." },
];

export default function MotelliPage() {
  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "0 24px" }}>
      <section style={{ padding: "56px 0 48px", maxWidth: 720 }}>
        <h1
          style={{
            fontFamily: FONTE_TITULO,
            fontSize: "clamp(38px, 7vw, 64px)",
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
            margin: "0 0 20px",
          }}
        >
          O sistema do restaurante, do pedido ao caixa.
        </h1>
        <p style={{ fontSize: 19, lineHeight: 1.55, color: CORES.suave, margin: "0 0 28px", maxWidth: 600 }}>
          O Motelli nasceu dentro de uma pizzaria e cresceu com a rotina dela: salão, delivery, cozinha, compras, equipe e o financeiro no mesmo lugar, com
          telas feitas pra quem está trabalhando, não pra quem está vendendo.
        </p>
        <a
          href={`mailto:${CONTATO_EMAIL}?subject=Quero%20conhecer%20o%20Motelli`}
          style={{
            display: "inline-block",
            background: CORES.manjericao,
            color: "#fff",
            padding: "14px 22px",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 16,
          }}
        >
          Falar com a gente
        </a>
      </section>

      <section style={{ padding: "8px 0 56px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 0, borderTop: `1px solid ${CORES.linha}` }}>
          {AREAS.map((a) => (
            <div key={a.titulo} style={{ padding: "22px 20px 22px 0", borderBottom: `1px solid ${CORES.linha}` }}>
              <h2 style={{ fontFamily: FONTE_TITULO, fontSize: 20, margin: "0 0 8px", letterSpacing: "-0.02em" }}>{a.titulo}</h2>
              <p style={{ margin: 0, color: CORES.suave, lineHeight: 1.5, fontSize: 15.5 }}>{a.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "0 0 40px", maxWidth: 720 }}>
        <h2 style={{ fontFamily: FONTE_TITULO, fontSize: 26, letterSpacing: "-0.02em", margin: "0 0 10px" }}>Motelli Entregador</h2>
        <p style={{ color: CORES.suave, lineHeight: 1.55, margin: 0, fontSize: 16.5 }}>
          O app do entregador: recebe as entregas, mostra o caminho, confirma na porta do cliente e manda a posição pro restaurante enquanto está na
          rua. É um app só para todos os restaurantes que usam o Motelli, e cada entregador entra com o link pessoal que a empresa dele manda.
          O que ele coleta e por quê está na <a href="/motelli/privacidade" style={{ color: CORES.manjericaoEscuro }}>política de privacidade</a>.
        </p>
      </section>
    </main>
  );
}
