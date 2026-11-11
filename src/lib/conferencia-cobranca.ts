// Cobrança do fornecedor pelo WhatsApp: a partir das divergências da
// conferência (src/lib/conferencia-core.ts), monta a lista do que dá pra
// cobrar e o texto da mensagem. Sem servidor aqui: a tela escolhe os itens e
// o texto é montado na hora.
//
// Regra do dinheiro (pra não cobrar duas vezes o mesmo produto):
//   - nota cobrou mais do que chegou → "cobrado sem entregar" (valor da nota);
//   - faltou / veio menos SEM nota ligada → valor pelo preço cotado (pra
//     descontar no pagamento);
//   - faltou / veio menos COM nota ligada → só aviso de entrega: se a nota
//     cobrou, o item "cobrado sem entregar" já leva o valor;
//   - preço da nota acima do cotado → diferença × quantidade da nota;
//   - item na nota fora do pedido → valor do item.
import type { Divergencia, TipoDivergencia } from "@/lib/conferencia-core";

export type PedidoCobranca = {
  id: string;
  data: string; // AAAA-MM-DD
  temNota: boolean;
  notaNumero?: string | null;
  itens: Divergencia[];
};

export type LinhaCobranca = {
  chave: string; // pedido:índice
  pedidoId: string;
  tipo: TipoDivergencia;
  grupo: string;
  texto: string;
  valor: number | null; // R$ a acertar (null = só aviso)
  marcada: boolean; // já vem marcada?
};

const GRUPOS: Partial<Record<TipoDivergencia, string>> = {
  faltou: "Não veio",
  qtd_recebida: "Veio menos que o pedido",
  cobrado_nao_recebido: "Cobrado na nota sem entregar",
  preco_nota_acima: "Preço acima do combinado na cotação",
  nota_sem_pedido: "Na nota sem ter sido pedido",
  veio_a_mais: "Veio sem ter sido pedido",
};
export const ORDEM_GRUPOS = Object.values(GRUPOS);

const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const q = (n: number | null | undefined, un?: string) =>
  n == null ? "—" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}${un ? ` ${un}` : ""}`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** O que entra na lista de cobrança (com o texto de cada item), na ordem dos grupos. */
export function linhasDeCobranca(pedidos: PedidoCobranca[], unidadeDe: (produtoId: string | null) => string = () => ""): LinhaCobranca[] {
  const out: LinhaCobranca[] = [];
  for (const p of pedidos) {
    p.itens.forEach((d, i) => {
      const un = unidadeDe(d.produto_id);
      const base = { chave: `${p.id}:${i}`, pedidoId: p.id, tipo: d.tipo };
      switch (d.tipo) {
        case "faltou":
        case "qtd_recebida": {
          const falta = Number(d.pedido ?? 0) - Number(d.recebido ?? 0);
          if (!(falta > 0)) return; // veio mais que o pedido: não é cobrança
          const valor = !p.temNota && d.preco_cotado != null ? r2(falta * Number(d.preco_cotado)) : null;
          const texto = d.tipo === "faltou"
            ? `${d.produto}: pedimos ${q(d.pedido, un)}, não veio`
            : `${d.produto}: pedimos ${q(d.pedido, un)}, chegou ${q(d.recebido, un)} (faltou ${q(falta, un)})`;
          out.push({ ...base, grupo: GRUPOS[d.tipo]!, texto: texto + (valor != null ? ` — ${moeda(valor)}` : ""), valor, marcada: true });
          return;
        }
        case "cobrado_nao_recebido": {
          const valor = d.valor != null ? r2(d.valor) : null;
          out.push({ ...base, grupo: GRUPOS[d.tipo]!, texto: `${d.produto}: a nota cobra ${q(d.nota, un)}, chegou ${q(d.recebido, un)}${valor != null ? ` — ${moeda(valor)}` : ""}`, valor, marcada: true });
          return;
        }
        case "preco_nota_acima": {
          const valor = d.valor != null ? r2(d.valor) : null;
          out.push({ ...base, grupo: GRUPOS[d.tipo]!, texto: `${d.produto}: cotado ${moeda(Number(d.preco_cotado ?? 0))}, na nota ${moeda(Number(d.preco_nota ?? 0))}${un ? `/${un}` : ""} × ${q(d.nota, un)}${valor != null ? ` — ${moeda(valor)}` : ""}`, valor, marcada: true });
          return;
        }
        case "nota_sem_pedido": {
          const valor = d.valor != null ? r2(d.valor) : null;
          out.push({ ...base, grupo: GRUPOS[d.tipo]!, texto: `${d.produto}: ${q(d.nota, un)} × ${d.preco_nota != null ? moeda(d.preco_nota) : "—"}${valor != null ? ` — ${moeda(valor)}` : ""}`, valor, marcada: true });
          return;
        }
        case "veio_a_mais":
          out.push({ ...base, grupo: GRUPOS[d.tipo]!, texto: `${d.produto}: chegou ${q(d.recebido, un)}`, valor: null, marcada: false });
          return;
        default:
          // preço abaixo, quantidade da nota e unidade diferente são conferência
          // nossa, não cobrança.
          return;
      }
    });
  }
  const ordem = (g: string) => ORDEM_GRUPOS.indexOf(g);
  return out.sort((a, b) => ordem(a.grupo) - ordem(b.grupo));
}

/** Texto da mensagem com os itens escolhidos. */
export function textoDaCobranca(opts: {
  empresa: string;
  fornecedor: string;
  pedidos: PedidoCobranca[];
  linhas: LinhaCobranca[];
  escolhidas: Set<string>;
  fecho?: string;
}): string {
  const sel = opts.linhas.filter((l) => opts.escolhidas.has(l.chave));
  const usados = opts.pedidos.filter((p) => sel.some((l) => l.pedidoId === p.id));
  const variosPedidos = usados.length > 1;
  const datas = usados.map((p) => dm(p.data) + (p.notaNumero ? ` (nota ${p.notaNumero})` : ""));
  const linhas: string[] = [];
  linhas.push(`*${opts.empresa} — conferência ${variosPedidos ? "dos pedidos" : "do pedido"}*`);
  linhas.push(`${opts.fornecedor}${datas.length ? ` · ${variosPedidos ? "pedidos de " : "pedido de "}${datas.join(", ")}` : ""}`);
  for (const g of ORDEM_GRUPOS) {
    const doGrupo = sel.filter((l) => l.grupo === g);
    if (!doGrupo.length) continue;
    linhas.push("", `*${g}:*`);
    for (const l of doGrupo) {
      const ped = variosPedidos ? opts.pedidos.find((p) => p.id === l.pedidoId) : null;
      linhas.push(`- ${l.texto}${ped ? ` [pedido ${dm(ped.data)}]` : ""}`);
    }
  }
  const total = r2(sel.reduce((s, l) => s + (l.valor ?? 0), 0));
  if (total > 0) linhas.push("", `*Total a acertar: ${moeda(total)}*`);
  const fecho = (opts.fecho ?? "").trim();
  if (fecho) linhas.push("", fecho);
  return linhas.join("\n");
}

export const FECHO_PADRAO = "Podem verificar e nos retornar como fica o acerto (crédito, desconto no boleto ou reposição)? Obrigado!";

/** Link do WhatsApp Web (regra do painel: nunca wa.me). Sem número, abre pra escolher o contato. */
export function linkWhatsWeb(numero: string | null | undefined, texto: string): string {
  // O cadastro guarda DDD + número (como na cotação); com o 55 na frente também vale.
  let n = String(numero ?? "").replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = `55${n}`;
  const t = encodeURIComponent(texto);
  return n.length >= 12 ? `https://web.whatsapp.com/send?phone=${n}&text=${t}` : `https://web.whatsapp.com/send?text=${t}`;
}
