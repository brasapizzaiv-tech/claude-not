import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { abrirCaixa } from "../actions";
import { servicoAgora } from "../util";
import { CaixaAcoes } from "./acoes";
import { FechamentoZ } from "./fechamento-z";
import { ReceberComandas } from "./receber";
import { NotasPendentes, type Pendente } from "./notas-pendentes";
import { pixConfigurado } from "@/lib/pix";
import { NfceAutoToggle } from "@/components/nfce-auto-toggle";
import { lerNfceAuto } from "../fiscal-actions";

const FORMAS_PGTO = ["Dinheiro", "Pix", "Cartão de crédito", "Cartão de débito", "Vale refeição", "Saldo cliente", "Compra da equipe"];

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Mov = {
  id: string;
  tipo: string;
  descricao: string | null;
  forma_pagamento: string | null;
  valor: number;
  criado_em: string;
};

export default async function CaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ abrir?: string }>;
}) {
  const { abrir } = await searchParams;
  const supabase = await createClient();
  const { data: caixa } = await supabase
    .from("pdv_caixas")
    .select("id, nome, saldo_inicial, aberto_em, status")
    .eq("status", "aberto")
    .order("aberto_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ---- Sem caixa aberto: formulário de abertura ----
  if (!caixa) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Link href="/salao" className="text-sm text-texto-suave hover:text-orange-600">
          ← Salão
        </Link>
        <h1 className="mt-2 font-numero text-2xl font-semibold tracking-apertada text-texto">Frente de Caixa</h1>
        <p className="mt-1 text-texto-suave">Nenhum caixa aberto. Abra um para começar a receber.</p>
        <Link href="/salao/caixa/pix" className="mt-2 inline-flex items-center gap-1.5 text-sm text-orange-600 hover:underline"><Icone nome="rapido" tamanho={14} /> Pix recebidos / estornar</Link>

        <form
          action={abrirCaixa}
          className="mt-6 space-y-4 rounded-cartao bg-painel-foco-fundo p-5 text-painel-foco-texto"
        >
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Nome / turno</label>
            <input
              name="nome"
              defaultValue="Noite"
              className="min-h-11 w-full rounded-controle border border-current/30 bg-transparent px-3 text-sm outline-none placeholder:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Troco inicial / saldo anterior (R$)</label>
            <input
              name="saldo_inicial"
              inputMode="decimal"
              placeholder="0,00"
              className="min-h-11 w-40 rounded-controle border border-current/30 bg-transparent px-3 font-numero text-sm outline-none"
            />
          </div>
          <button className="min-h-11 rounded-controle bg-painel-foco-texto px-5 text-sm font-semibold text-painel-foco-fundo transition hover:opacity-90">
            Abrir caixa
          </button>
        </form>
      </div>
    );
  }

  // ---- Caixa aberto: movimentos + resumo ----
  const { data: movRows } = await supabase
    .from("pdv_caixa_mov")
    .select("id, tipo, descricao, forma_pagamento, valor, criado_em")
    .eq("caixa_id", caixa.id)
    .order("criado_em", { ascending: false });
  const movs = (movRows as Mov[]) ?? [];

  // Comandas ABERTAS com o total (buffet + itens + serviço) — para receber aqui.
  const { data: cfgRows } = await supabase.from("pdv_config").select("chave, valor");
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;
  const serv = servicoAgora(cfg);

  const { data: comAbertas } = await supabase
    .from("pdv_comandas")
    .select("id, numero, mesa, valor_buffet, buffet_pago, buffet_valor_pago, livre, peso")
    .eq("status", "aberta")
    .order("numero", { ascending: false });
  const abertas =
    (comAbertas as {
      id: string;
      numero: number;
      mesa: string | null;
      valor_buffet: number;
      buffet_pago: boolean;
      buffet_valor_pago: number;
      livre: boolean | null;
      peso: number | null;
    }[]) ?? [];

  const fator = 1 + serv / 100;
  type ItemCom = {
    id: string;
    nome: string;
    qtd: number;
    preco: number;
    pago: boolean;
    valorPago: number;
  };
  const itensPorCom = new Map<string, ItemCom[]>();
  if (abertas.length > 0) {
    const { data: itc } = await supabase
      .from("pdv_comanda_itens")
      .select("id, comanda_id, qtd, preco_unit, pago, valor_pago, descricao")
      .in("comanda_id", abertas.map((c) => c.id));
    for (const i of (itc as unknown as {
      id: string;
      comanda_id: string;
      qtd: number;
      preco_unit: number;
      pago: boolean;
      valor_pago: number;
      descricao: string | null;
    }[]) ?? []) {
      const arr = itensPorCom.get(i.comanda_id) ?? [];
      arr.push({
        id: i.id,
        nome: i.descricao ?? "Item",
        qtd: Number(i.qtd),
        preco: Number(i.preco_unit),
        pago: !!i.pago,
        valorPago: Number(i.valor_pago ?? 0),
      });
      itensPorCom.set(i.comanda_id, arr);
    }
  }

  const comandasReceber = abertas.map((c) => {
    const itens = itensPorCom.get(c.id) ?? [];
    const sub = Number(c.valor_buffet ?? 0) + itens.reduce((s, i) => s + i.qtd * i.preco, 0);
    const total = Math.round(sub * fator * 100) / 100;
    // Restante = o que falta de cada linha (com serviço) menos o já pago.
    const restItens = itens.reduce(
      (s, i) => s + Math.max(0, i.qtd * i.preco * fator - i.valorPago),
      0,
    );
    const restBuffet = Math.max(0, Number(c.valor_buffet ?? 0) * fator - Number(c.buffet_valor_pago ?? 0));
    return {
      id: c.id,
      numero: c.numero,
      mesa: c.mesa ?? "",
      total,
      restante: Math.round((restItens + restBuffet) * 100) / 100,
      buffet: Number(c.valor_buffet ?? 0),
      buffetPago: !!c.buffet_pago,
      buffetValorPago: Number(c.buffet_valor_pago ?? 0),
      livre: !!c.livre,
      pesada: Number(c.peso ?? 0) > 0,
      itens,
    };
  });
  const servPercent = serv;

  const nfce = await lerNfceAuto();

  // Cardápio do "Inserir Produto" (o cliente é buscado no servidor ao digitar).
  // Clientes em blocos de 1000: o PostgREST corta em 1000 e já são 3.000+ —
  // sem isso, cliente depois do 1000º em ordem alfabética não aparecia no
  // "Vincular Cliente".
  // O "Vincular Cliente" agora busca no servidor conforme digita
  // (buscarClientesCaixa): a tela não baixa mais os 3.2 mil clientes a cada
  // carregamento — era isso que travava o caixa depois de cada recebimento.
  const { data: menuRows } = await supabase
    .from("pdv_itens").select("id, nome, preco, promo_preco, ativo").order("nome");
  const menu =
    ((menuRows as { id: string; nome: string; preco: number; promo_preco: number | null; ativo: boolean | null }[]) ?? [])
      .filter((m) => m.ativo !== false)
      // Mesmo preço que o servidor cobra (promoção ativa substitui o normal) —
      // senão o total na tela do caixa fica maior que o gravado na comanda.
      .map((m) => ({ id: m.id, nome: m.nome, preco: Number(m.promo_preco ?? 0) > 0 ? Number(m.promo_preco) : Number(m.preco) }));

  // Notas automáticas ainda na janela de espera (ou que deram erro).
  // Só o que ainda depende de alguém: assim que a nota sai, a linha some da
  // tela (pra reimprimir depois: Salão → Notas fiscais).
  const { data: pendRows } = await supabase
    .from("nfce_pendentes")
    .select("id, numeros, valor, formas, cpf_cnpj, status, erro, emitir_em")
    .in("status", ["aguardando", "emitindo", "erro"])
    .order("emitir_em", { ascending: true })
    .limit(30);
  const pendentes: Pendente[] = ((pendRows as {
    id: string; numeros: string | null; valor: number | null; formas: string | null;
    cpf_cnpj: string | null; status: string; erro: string | null; emitir_em: string;
  }[]) ?? []).map((r) => ({
    id: r.id,
    numeros: r.numeros,
    valor: Number(r.valor ?? 0),
    formas: r.formas,
    cpfCnpj: r.cpf_cnpj,
    status: r.status,
    erro: r.erro,
    emitirEm: r.emitir_em,
  }));

  // Funcionários ativos + quanto cada um já deve em Compras internas (pra
  // forma "Compra da equipe" mostrar o saldo na hora de escolher a pessoa).
  const [{ data: colabRows }, { data: retRows }] = await Promise.all([
    supabase.from("colaboradores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("retiradas").select("colaborador_id, valor").eq("status", "aberto"),
  ]);
  const abertoPorColab = new Map<string, number>();
  for (const r of ((retRows as { colaborador_id: string | null; valor: number }[]) ?? [])) {
    if (!r.colaborador_id) continue;
    abertoPorColab.set(r.colaborador_id, Math.round(((abertoPorColab.get(r.colaborador_id) ?? 0) + Number(r.valor)) * 100) / 100);
  }
  const colaboradores = ((colabRows as { id: string; nome: string }[]) ?? []).map((c) => ({
    id: c.id, nome: c.nome, aberto: abertoPorColab.get(c.id) ?? 0,
  }));

  const saldoInicial = Number(caixa.saldo_inicial);
  const vendasPorForma = new Map<string, number>();
  let suprimentos = 0;
  let sangrias = 0;
  for (const m of movs) {
    const v = Number(m.valor);
    if (m.tipo === "venda") {
      const f = m.forma_pagamento || "Outros";
      vendasPorForma.set(f, (vendasPorForma.get(f) || 0) + v);
    } else if (m.tipo === "suprimento") suprimentos += v;
    else if (m.tipo === "sangria") sangrias += v;
  }
  const totalVendas = [...vendasPorForma.values()].reduce((s, v) => s + v, 0);
  const vendasDinheiro = vendasPorForma.get("Dinheiro") || 0;
  const dinheiroEmCaixa = saldoInicial + vendasDinheiro + suprimentos - sangrias;

  const abertoHora = new Date(caixa.aberto_em).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/salao" className="text-sm text-texto-suave hover:text-orange-600">
            ← Salão
          </Link>
          <h1 className="mt-1 font-numero text-2xl font-semibold tracking-apertada text-texto">Frente de Caixa</h1>
          <p className="mt-1 text-sm text-texto-suave">
            {caixa.nome} · <span className="font-medium text-emerald-600">Aberto</span> às {abertoHora}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <NfceAutoToggle ligado={nfce.ligado} producao={nfce.producao} />
          <Link href="/salao/caixa/pix" className="flex min-h-11 items-center rounded-controle border border-borda-forte px-4 text-sm font-medium text-texto-suave transition hover:bg-superficie-suave">
            <Icone nome="rapido" tamanho={15} className="mr-1.5" /> Pix recebidos
          </Link>
          <Link href="/salao/caixa/fiado" className="flex min-h-11 items-center rounded-controle border border-borda-forte px-4 text-sm font-medium text-texto-suave transition hover:bg-superficie-suave">
            <Icone nome="equipe" tamanho={15} className="mr-1.5" /> Fiado de clientes
          </Link>
          <CaixaAcoes caixaId={caixa.id} />
          <FechamentoZ
            caixaId={caixa.id}
            nome={caixa.nome}
            abertoHora={abertoHora}
            saldoInicial={saldoInicial}
            vendasPorForma={[...vendasPorForma.entries()]}
            suprimentos={suprimentos}
            sangrias={sangrias}
            totalVendas={totalVendas}
            esperado={dinheiroEmCaixa}
          />
        </div>
      </div>

      <NotasPendentes lista={pendentes} />

      {/* Frente: receber comandas (buscar, somar várias, pagar) */}
      <div className="mb-4">
        <ReceberComandas
          comandas={comandasReceber}
          formas={FORMAS_PGTO}
          servPercent={servPercent}
          autoAbrir={abrir}
          menu={menu}
          pixAtivo={pixConfigurado()}
          nfceAuto={nfce.ligado && nfce.producao}
          colaboradores={colaboradores}
        />
      </div>

      {/* Atalhos e resumo: o resumo fica fechado pra tela do caixa respirar;
          o número que interessa (dinheiro em caixa) aparece no próprio botão. */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/salao/caixa/movimentos"
          className="flex min-h-11 items-center rounded-controle border border-borda-forte px-4 text-sm font-medium text-texto-suave transition hover:bg-superficie-suave"
        >
          <Icone nome="documento" tamanho={15} className="mr-1.5" /> Movimentações
        </Link>
        <Link
          href="/salao/caixa/tef"
          className="flex min-h-11 items-center rounded-controle border border-borda-forte px-4 text-sm font-medium text-texto-suave transition hover:bg-superficie-suave"
        >
          <Icone nome="cartao" tamanho={15} className="mr-1.5" /> Cartões (TEF)
        </Link>
      </div>

      <details className="mt-2 rounded-cartao bg-painel-cartao">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto"><Icone nome="grafico" tamanho={15} /> Resumo do caixa</span>
          {/* Sem valores à mostra: a tela do caixa é virada pro cliente na hora
              do Pix, e o movimento do dia não é da conta de quem está pagando. */}
          <span className="text-xs text-texto-fraco">toque para ver os valores</span>
        </summary>
        <div className="space-y-3 border-t border-borda p-4">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-texto-suave">
              <span>Saldo anterior</span>
              <span>{brl(saldoInicial)}</span>
            </div>
            {[...vendasPorForma.entries()].map(([forma, v]) => (
              <div key={forma} className="flex justify-between text-texto-suave">
                <span>Vendas · {forma}</span>
                <span>{brl(v)}</span>
              </div>
            ))}
            <div className="flex justify-between text-blue-600">
              <span>Suprimentos</span>
              <span>{brl(suprimentos)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Sangrias</span>
              <span>− {brl(sangrias)}</span>
            </div>
          </div>
          <div className="space-y-1 border-t border-borda pt-2 text-sm">
            <div className="flex justify-between font-medium text-texto">
              <span>Total recebido</span>
              <span>{brl(totalVendas)}</span>
            </div>
            <div className="flex justify-between font-numero text-lg font-semibold tracking-apertada text-texto">
              <span className="inline-flex items-center gap-1.5"><Icone nome="dinheiro" tamanho={14} /> Dinheiro no caixa</span>
              <span>{brl(dinheiroEmCaixa)}</span>
            </div>
          </div>
        </div>
      </details>

    </div>
  );
}
