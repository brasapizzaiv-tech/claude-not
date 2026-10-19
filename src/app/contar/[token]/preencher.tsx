"use client";

import { Icone } from "@/components/icone";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import type { Produto } from "@/lib/types";
import { EstoqueInput, calcular, normalizarCaixas, type Caixa } from "@/components/estoque-input";
import { LeitorQr } from "@/components/leitor-qr";
import { salvarContagemPublica, buscarProdutosContagem, consultarEtiquetaContagem, type EtiquetaContagem } from "./actions";
import { mapaReferencia, suspeito, explicacao, textoConsumo, type Referencia } from "@/lib/contagem-referencia";
import { ONDE_ROTULO, ehOnde, lerParcelas, type Parcela } from "@/lib/contagem-parcelas";

type ExtraProduto = { id: string; nome: string; unidade: string; categoria: string; sim_nao?: boolean };

type ItemInicial = {
  produto_id: string;
  qtd_estoque: number;
  qtd_pedir: number;
  parcelas?: unknown;
  precisa_comprar?: boolean | null;
};

// Caixas iniciais de um item: as parcelas gravadas (com onde e etiqueta), ou
// o total numa caixa só, como era antes.
function caixasDoItem(i: ItemInicial): Caixa[] {
  const ps = lerParcelas(i.parcelas);
  if (ps.length === 0) return [{ v: String(i.qtd_estoque ?? 0), onde: null }];
  return ps.map((p) => ({
    v: String(p.qtd),
    onde: p.onde,
    etiqueta: p.etiqueta_id && p.etiqueta_numero != null ? { id: p.etiqueta_id, numero: p.etiqueta_numero } : null,
  }));
}

export function PreencherClient({
  token,
  descricao,
  colaborador,
  finalizada,
  produtos,
  itens,
  referencia,
}: {
  token: string;
  descricao: string;
  colaborador: string;
  finalizada: boolean;
  produtos: Produto[];
  itens: ItemInicial[];
  referencia: Referencia[];
}) {
  const [salvando, startSave] = useTransition();
  // Conferência: "tinha X na última contagem + chegou Y" = máximo possível.
  const refs = useMemo(() => mapaReferencia(referencia), [referencia]);
  // "Contei de novo, está certo": guarda o NÚMERO confirmado de cada item, no
  // aparelho (junto do rascunho). Recarregar a página não perde, e o envio só
  // pergunta de novo se o número mudar depois de confirmado.
  const [confirmados, setConfirmados] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  // "Avulsa: A, B, C (19/10/2026)" → "Contagem avulsa · 19/10/2026".
  const mAvulsa = descricao.match(/^Avulsa:\s*(.+?)\s*\((\d{2}\/\d{2}\/\d{4})\)\s*$/);
  const tituloCurto = mAvulsa ? `Contagem avulsa · ${mAvulsa[2]}` : descricao;
  const categoriasAvulsa = mAvulsa ? mAvulsa[1] : null;
  const [verCategorias, setVerCategorias] = useState(false);

  // Itens que o contador ADICIONOU (não estavam na lista dele, mas existem no estoque).
  const [extras, setExtras] = useState<ExtraProduto[]>([]);
  const [addAberto, setAddAberto] = useState(false);
  const [addBusca, setAddBusca] = useState("");
  const [addResultados, setAddResultados] = useState<ExtraProduto[]>([]);
  const [addBuscando, setAddBuscando] = useState(false);

  // TODOS os valores vivem AQUI (não nos campos da tela). Assim, filtrar a
  // busca ou rolar a página nunca apaga o que já foi digitado.
  const [valores, setValores] = useState<Record<string, Caixa[]>>(() => {
    const v: Record<string, Caixa[]> = {};
    // Linha gravada = item respondido (0 também): mostra o 0 em vez de vazio.
    for (const i of itens) v[i.produto_id] = caixasDoItem(i);
    return v;
  });
  // Leitor de etiquetas (QR): cada leitura vira uma caixa no item certo.
  const [leitor, setLeitor] = useState(false);
  const [avisoLeitor, setAvisoLeitor] = useState<string | null>(null);
  const [numeroEtq, setNumeroEtq] = useState("");
  const [lidas, setLidas] = useState(0);

  // Itens "precisa comprar?" (produto marcado em Produtos): em vez da
  // quantidade, a pessoa responde sim ou não. true = precisa comprar.
  const [simNao, setSimNao] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const i of itens) if (typeof i.precisa_comprar === "boolean") m[i.produto_id] = i.precisa_comprar;
    return m;
  });
  // Filtro "Faltam": a lista de quem faltava na hora do toque fica fixa, pra o
  // item não sumir da tela enquanto a pessoa ainda está digitando nele.
  const [soFaltam, setSoFaltam] = useState<Set<string> | null>(null);

  const chaveRascunho = `contagem_rascunho_${token}`;
  const chaveConfirmados = `contagem_conferidos_${token}`;
  function confirmar(id: string, total: number) {
    setConfirmados((atual) => {
      const novo = { ...atual, [id]: total };
      try { localStorage.setItem(chaveConfirmados, JSON.stringify(novo)); } catch { /* sem storage */ }
      return novo;
    });
  }

  // Restaura o rascunho salvo no aparelho (proteção contra recarregar a página).
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const conf = JSON.parse(localStorage.getItem(chaveConfirmados) || "{}");
        if (conf && typeof conf === "object") setConfirmados(conf as Record<string, number>);
      } catch { /* sem storage */ }
      try {
        const raw = localStorage.getItem(chaveRascunho);
        if (!raw) return;
        type Rascunho = Record<string, (string | Caixa)[]>;
        // Rascunhos antigos têm só o texto de cada caixa; os novos têm onde/etiqueta.
        const norm = (o: Rascunho): Record<string, Caixa[]> =>
          Object.fromEntries(Object.entries(o).map(([k, cs]) => [k, normalizarCaixas(Array.isArray(cs) ? cs : [])]));
        const draft = JSON.parse(raw) as { v?: Rascunho; x?: ExtraProduto[]; s?: Record<string, boolean> } | Rascunho;
        if (draft && typeof draft === "object") {
          const novo = draft as { v?: Rascunho; x?: ExtraProduto[]; s?: Record<string, boolean> };
          if (novo.v && typeof novo.v === "object" && !Array.isArray(novo.v)) {
            const v = norm(novo.v);
            setValores((atual) => ({ ...atual, ...v }));
            if (Array.isArray(novo.x)) setExtras(novo.x);
            if (novo.s && typeof novo.s === "object") setSimNao((atual) => ({ ...atual, ...novo.s }));
          } else {
            const antigo = norm(draft as Rascunho);
            setValores((atual) => ({ ...atual, ...antigo }));
          }
          setMsg("Recuperei o que você já tinha digitado neste aparelho.");
        }
      } catch { /* sem storage */ }
    }, 0);
    return () => clearTimeout(id);
  }, [chaveRascunho, chaveConfirmados]);

  function gravarRascunho(v: Record<string, Caixa[]>, x: ExtraProduto[], sn: Record<string, boolean> = simNao) {
    try { localStorage.setItem(chaveRascunho, JSON.stringify({ v, x, s: sn })); } catch { /* sem storage */ }
  }
  function responderSimNao(produtoId: string, precisa: boolean) {
    setSimNao((atual) => {
      const novo = { ...atual, [produtoId]: precisa };
      gravarRascunho(valores, extras, novo);
      return novo;
    });
  }
  function setCaixas(produtoId: string, caixas: Caixa[]) {
    setValores((v) => {
      const novo = { ...v, [produtoId]: caixas };
      gravarRascunho(novo, extras);
      return novo;
    });
  }

  const totalDe = (produtoId: string) =>
    Math.round((valores[produtoId] ?? []).reduce((s, b) => s + calcular(b.v), 0) * 1000) / 1000;

  const ehSimNao = (produtoId: string) =>
    !!produtos.find((p) => p.id === produtoId)?.contagem_sim_nao || !!extras.find((x) => x.id === produtoId)?.sim_nao;

  // Preenchido = o contador respondeu algo (0 também vale!).
  const foiPreenchido = (produtoId: string) =>
    ehSimNao(produtoId) ? typeof simNao[produtoId] === "boolean" : (valores[produtoId] ?? []).some((b) => b.v.trim() !== "");

  // ---- etiquetas lidas na contagem ----
  // Cada etiqueta vira uma caixa no item dela, com a quantidade e o "onde"
  // que estão impressos. Etiqueta já lida nesta contagem, ou já baixada
  // (usada/descartada), não conta. Produto fora da lista do contador entra
  // como "adicionado por você".
  function avisar(txt: string) {
    setAvisoLeitor(txt);
    setTimeout(() => setAvisoLeitor(null), 1800);
  }
  function tratarEtiqueta(r: EtiquetaContagem) {
    if (!r.ok) { avisar(r.mensagem || "Etiqueta não encontrada"); return; }
    if (r.status !== "ativa") { avisar(`Nº ${r.numero} já está "${r.status}" — não conta`); return; }
    if (!r.produto_id) { avisar(`Nº ${r.numero} não está ligada a um produto do estoque`); return; }
    const pid = r.produto_id;
    if (ehSimNao(pid)) { avisar(`${r.nome_produto || r.produto}: esse item é só "precisa comprar?" — responda na lista`); return; }
    const jaLida = Object.values(valores).some((cs) => cs.some((c) => c.etiqueta?.id === r.id));
    if (jaLida) { avisar(`Nº ${r.numero} já foi lida nesta contagem`); return; }
    const naLista = produtos.some((p) => p.id === pid) || extras.some((x) => x.id === pid);
    let extrasNovo = extras;
    if (!naLista) {
      extrasNovo = [...extras, { id: pid, nome: r.nome_produto || r.produto, unidade: r.unidade_produto || r.unidade || "un", categoria: r.categoria || "Sem categoria" }];
      setExtras(extrasNovo);
    }
    const qtd = r.quantidade != null && r.quantidade > 0 ? r.quantidade : 1;
    const onde = ehOnde(r.conservacao) ? r.conservacao : null;
    setValores((v) => {
      // Caixa vazia ou "0" digitado some quando entra a primeira etiqueta.
      const atuais = (v[pid] ?? []).filter((c) => c.etiqueta || (c.v.trim() !== "" && calcular(c.v) !== 0));
      const novo = { ...v, [pid]: [...atuais, { v: String(qtd), onde, etiqueta: { id: r.id, numero: r.numero } }] };
      gravarRascunho(novo, extrasNovo);
      return novo;
    });
    setLidas((n) => n + 1);
    const nome = r.nome_produto || r.produto;
    avisar(`+ ${nome} · nº ${r.numero} · ${qtd} ${r.unidade ?? ""}${onde ? ` ${ONDE_ROTULO[onde].toLowerCase()}` : ""}`);
    if (navigator.vibrate) navigator.vibrate(90);
  }
  function aoLerQr(texto: string) {
    const id = texto.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    if (!id) { avisar("Esse QR não é de uma etiqueta"); return; }
    consultarEtiquetaContagem(token, { id }).then(tratarEtiqueta);
  }
  function lerPorNumero() {
    const n = Number(numeroEtq.replace(/\D/g, ""));
    if (!n) return;
    setNumeroEtq("");
    consultarEtiquetaContagem(token, { numero: n }).then(tratarEtiqueta);
  }
  // Digitou mais do que podia ter e ainda não confirmou que contou de novo.
  const ehSuspeito = (produtoId: string) => suspeito(totalDe(produtoId), refs.get(produtoId));
  const jaConfirmado = (produtoId: string) =>
    produtoId in confirmados && Math.abs(confirmados[produtoId] - totalDe(produtoId)) < 1e-9;
  const precisaConferir = (produtoId: string) => !ehSimNao(produtoId) && ehSuspeito(produtoId) && !jaConfirmado(produtoId);

  function AvisoRef({ id }: { id: string }) {
    const r = refs.get(id);
    if (!r) return null;
    const f = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    if (!ehSuspeito(id)) {
      return (
        <div className="mt-1 text-mini text-zinc-400">
          última contagem: {f(r.ultima_qtd)}{r.comprado > 0 ? ` · chegou depois: ${f(r.comprado)}` : ""}{textoConsumo(r.consumo_semana) ? ` · ${textoConsumo(r.consumo_semana)}` : ""}
        </div>
      );
    }
    if (jaConfirmado(id)) {
      return <div className="mt-1 text-mini text-emerald-600">✓ Conferido: você contou de novo e confirmou {f(totalDe(id))}.</div>;
    }
    return (
      <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <Icone nome="alerta" tamanho={13} className="mr-1" /> {explicacao(r, totalDe(id))}
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={() => confirmar(id, totalDe(id))}
            className="rounded-md bg-amber-600 px-2 py-1 font-semibold text-white"
          >
            Contei de novo, está certo
          </button>
          <span className="self-center text-mini">ou corrija o número acima</span>
        </div>
      </div>
    );
  }

  // "Precisa comprar?" — render function (não componente: componente criado
  // dentro do render remonta a cada tecla).
  const botoesSimNao = (id: string) => {
    const r = simNao[id];
    const base = "flex-1 rounded-lg py-3 text-sm font-semibold ring-1 transition";
    return (
      <div>
        <p className="mb-1.5 text-sm text-zinc-500">Só de olhar: precisa comprar?</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => responderSimNao(id, false)}
            className={`${base} ${r === false ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-zinc-700 ring-zinc-300 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-700"}`}
          >
            Tem o suficiente
          </button>
          <button
            type="button"
            onClick={() => responderSimNao(id, true)}
            className={`${base} ${r === true ? "bg-orange-500 text-marca-sobre-primaria ring-orange-500" : "bg-white text-zinc-700 ring-zinc-300 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-700"}`}
          >
            Precisa comprar
          </button>
        </div>
      </div>
    );
  };

  const todosItens = useMemo(
    () => [
      ...produtos.map((p) => ({ id: p.id, nome: p.nome })),
      ...extras.map((x) => ({ id: x.id, nome: x.nome })),
    ],
    [produtos, extras],
  );
  const preenchidos = todosItens.filter((p) => foiPreenchido(p.id)).length;

  // ---- adicionar item fora da lista ----
  async function buscarAdd() {
    if (addBusca.trim().length < 2) return;
    setAddBuscando(true);
    const r = await buscarProdutosContagem(token, addBusca);
    setAddBuscando(false);
    const jaTem = new Set([...produtos.map((p) => p.id), ...extras.map((x) => x.id)]);
    setAddResultados(r.filter((p) => !jaTem.has(p.id)));
  }
  function adicionarExtra(p: ExtraProduto) {
    setExtras((x) => {
      const novo = [...x, p];
      gravarRascunho(valores, novo);
      return novo;
    });
    setAddResultados((r) => r.filter((i) => i.id !== p.id));
    setAddBusca(""); setAddResultados([]); setAddAberto(false);
  }
  function removerExtra(id: string) {
    setExtras((x) => {
      const novo = x.filter((i) => i.id !== id);
      gravarRascunho(valores, novo);
      return novo;
    });
  }

  const grupos = useMemo(() => {
    const m = new Map<string, Produto[]>();
    for (const p of produtos) {
      const cat = p.categorias?.nome ?? "Sem categoria";
      const arr = m.get(cat) ?? [];
      arr.push(p);
      m.set(cat, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [produtos]);

  // Busca ignorando acentos ("jager" acha "Jägermeister").
  const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const gruposFiltrados = useMemo(() => {
    const b = semAcento(busca.trim());
    if (!b && !soFaltam) return grupos;
    return grupos
      .map(([cat, itens]) => [
        cat,
        itens.filter((p) => (!b || semAcento(p.nome).includes(b)) && (!soFaltam || soFaltam.has(p.id))),
      ] as [string, Produto[]])
      .filter(([, itens]) => itens.length > 0);
  }, [grupos, busca, soFaltam]);
  const faltamAgora = todosItens.length - preenchidos;
  function filtrarFaltam(ligar: boolean) {
    setSoFaltam(ligar ? new Set(todosItens.filter((p) => !foiPreenchido(p.id)).map((p) => p.id)) : null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function salvar() {
    // TODO item precisa de resposta — não tem nenhum? Digite 0.
    const faltando = todosItens.filter((p) => !foiPreenchido(p.id));
    if (faltando.length > 0) {
      setMsg(null);
      const nomes = faltando.slice(0, 6).map((f) => f.nome).join(", ");
      const resto = faltando.length > 6 ? ` e mais ${faltando.length - 6}` : "";
      setErroEnvio(
        `Faltam ${faltando.length} itens: ${nomes}${resto}. Preencha todos — se não tiver nenhum, digite 0.`,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Números acima do possível: precisa contar de novo (ou confirmar).
    const conferir = todosItens.filter((p) => precisaConferir(p.id));
    if (conferir.length > 0) {
      setMsg(null);
      setErroEnvio(
        `${conferir.length} item(ns) com número maior do que podia ter: ${conferir.slice(0, 5).map((f) => f.nome).join(", ")}${conferir.length > 5 ? "…" : ""}. Conte de novo — se estiver certo mesmo, toque em "Contei de novo, está certo" no item.`,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErroEnvio(null);
    startSave(async () => {
      const payload = todosItens
        .filter((p) => foiPreenchido(p.id))
        .map((p) => ehSimNao(p.id) ? ({
          // "Precisa comprar?": sem quantidade; a cotação lê precisa_comprar.
          produto_id: p.id,
          qtd_estoque: 0,
          qtd_pedir: 0,
          preenchido: "true",
          precisa_comprar: simNao[p.id] === true,
          parcelas: [] as Parcela[],
        }) : ({
          produto_id: p.id,
          qtd_estoque: totalDe(p.id),
          qtd_pedir: 0,
          preenchido: "true",
          // O detalhe: cada caixa com onde está e a etiqueta, se veio de uma.
          parcelas: (valores[p.id] ?? [])
            .filter((c) => c.v.trim() !== "")
            .map((c): Parcela => ({
              qtd: calcular(c.v),
              onde: c.onde,
              etiqueta_id: c.etiqueta?.id ?? null,
              etiqueta_numero: c.etiqueta?.numero ?? null,
            })),
        }));
      const r = await salvarContagemPublica(token, payload);
      if (r.ok) {
        try { localStorage.removeItem(chaveRascunho); localStorage.removeItem(chaveConfirmados); } catch { /* sem storage */ }
        setMsg(`Contagem enviada! ${r.gravados} de ${todosItens.length} itens gravados. Obrigado, ${colaborador}.`);
      } else {
        setMsg(r.erro ?? "Não foi possível salvar. Tente de novo — o que você digitou está guardado neste aparelho.");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-32 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        {/* Avulsa com várias categorias: o nome inteiro ocupava meia tela. Fica
            "Contagem avulsa · 19/10/2026"; as categorias abrem num toque. */}
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          {tituloCurto}
        </h1>
        <p className="text-sm text-zinc-500">
          Contagem de {colaborador}
          {categoriasAvulsa && (
            <button type="button" onClick={() => setVerCategorias((v) => !v)} className="ml-2 font-semibold text-orange-600 underline-offset-2 hover:underline">
              {verCategorias ? "esconder categorias" : "ver categorias"}
            </button>
          )}
        </p>
        {categoriasAvulsa && verCategorias && <p className="mt-1 text-xs text-zinc-500">{categoriasAvulsa}</p>}
      </header>

      <div className="mx-auto max-w-xl px-4">
        {msg && (
          <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
            {msg}
          </div>
        )}
        {erroEnvio && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            <Icone nome="alerta" tamanho={15} className="mr-1.5" /> {erroEnvio}
          </div>
        )}

        {finalizada ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Esta contagem já foi finalizada. Não é mais possível editar.
          </div>
        ) : produtos.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-zinc-200 p-6 text-center text-zinc-500 dark:border-zinc-800">
            Nenhum produto atribuído a você nesta contagem.
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-zinc-500">
              Preencha <b>quanto tem em estoque</b> de cada item. Em cada caixa dá pra dizer se está no congelado, resfriado ou ambiente.
            </p>
            <div className="mt-3 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar item..."
                  className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-3 pr-11 text-base text-zinc-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca("")}
                    aria-label="Limpar a busca"
                    className="absolute right-0 top-0 flex h-full w-11 items-center justify-center text-xl text-zinc-400"
                  >
                    ✕
                  </button>
                )}
              </div>
              {/* Lê o QR das etiquetas: cada uma soma no item dela, com o "onde" impresso. */}
              <button
                type="button"
                onClick={() => setLeitor(true)}
                className="shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                <span className="inline-flex items-center gap-1.5"><Icone nome="camera" tamanho={15} /> Ler etiquetas{lidas > 0 ? ` (${lidas})` : ""}</span>
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => filtrarFaltam(false)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${!soFaltam ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-white text-zinc-600 ring-1 ring-zinc-300 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700"}`}
              >
                Todos ({todosItens.length})
              </button>
              <button
                type="button"
                onClick={() => filtrarFaltam(true)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${soFaltam ? "bg-orange-500 text-marca-sobre-primaria" : "bg-white text-orange-600 ring-1 ring-orange-300 dark:bg-zinc-900 dark:ring-orange-800"}`}
              >
                Faltam ({faltamAgora})
              </button>
              {soFaltam && faltamAgora < soFaltam.size && (
                <button type="button" onClick={() => filtrarFaltam(true)} className="text-xs text-zinc-500 underline">
                  tirar os já feitos
                </button>
              )}
            </div>
            {leitor && (
              <LeitorQr titulo="Ler etiquetas da contagem" aoLer={aoLerQr} fechar={() => setLeitor(false)} aviso={avisoLeitor}>
                <p className="py-2 text-center text-xs text-zinc-400">
                  Cada etiqueta lida soma no item dela, com a quantidade e o local impressos. {lidas > 0 ? `${lidas} lida(s) nesta contagem.` : ""}
                </p>
                <div className="flex gap-2">
                  <input
                    inputMode="numeric"
                    value={numeroEtq}
                    onChange={(e) => setNumeroEtq(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") lerPorNumero(); }}
                    placeholder="Ou digite o nº da etiqueta"
                    className="flex-1 rounded-controle border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                  <button onClick={lerPorNumero} disabled={!numeroEtq.trim()} className="rounded-controle bg-zinc-700 px-4 py-2 text-sm font-semibold disabled:opacity-50">
                    Adicionar
                  </button>
                </div>
                <button onClick={() => setLeitor(false)} className="mt-4 w-full rounded-cartao bg-emerald-600 py-3 text-base font-bold text-white">
                  Pronto, voltar pra contagem
                </button>
              </LeitorQr>
            )}
            {gruposFiltrados.length === 0 && (
              <p className="mt-4 text-center text-sm text-zinc-400">
                Nenhum item com “{busca}”.
              </p>
            )}
            <div className="mt-4 space-y-6">
              {gruposFiltrados.map(([cat, itensCat]) => (
                <Fragment key={cat}>
                  <div>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      {cat} ({itensCat.length})
                    </h2>
                    <div className="space-y-2">
                      {itensCat.map((p) => {
                        const feito = foiPreenchido(p.id);
                        return (
                          <div
                            key={p.id}
                            className={`rounded-xl border bg-white p-3 dark:bg-zinc-900 ${feito ? "border-emerald-300 dark:border-emerald-800" : "border-zinc-200 dark:border-zinc-800"}`}
                          >
                            <div className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
                              {feito && <span className="mr-1 text-emerald-600">✓</span>}
                              {p.nome}
                              <span className="ml-1 text-xs font-normal text-zinc-400">
                                ({p.unidade})
                              </span>
                            </div>
                            {p.contagem_sim_nao ? botoesSimNao(p.id) : (
                              <>
                                <label className="block text-sm text-zinc-500">
                                  Em estoque
                                  <span className="ml-1 text-xs text-zinc-400">
                                    (em mais de um lugar? toque em “+ caixa”)
                                  </span>
                                  <div className="mt-1">
                                    <EstoqueInput
                                      name={`estoque_${p.id}`}
                                      caixas={valores[p.id] ?? [{ v: "", onde: null }]}
                                      onCaixasChange={(cs) => setCaixas(p.id, cs)}
                                      comLocal
                                    />
                                  </div>
                                </label>
                                <AvisoRef id={p.id} />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Fragment>
              ))}

              {/* Itens que o contador adicionou por conta */}
              {extras.length > 0 && (
                <div>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-500">
                    <Icone nome="novo" tamanho={14} className="mr-1" /> Adicionados por você ({extras.length})
                  </h2>
                  <div className="space-y-2">
                    {extras.map((p) => {
                      const feito = foiPreenchido(p.id);
                      return (
                        <div key={p.id} className={`rounded-xl border bg-white p-3 dark:bg-zinc-900 ${feito ? "border-emerald-300 dark:border-emerald-800" : "border-orange-200 dark:border-orange-900"}`}>
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {feito && <span className="mr-1 text-emerald-600">✓</span>}
                              {p.nome}
                              <span className="ml-1 text-xs font-normal text-zinc-400">({p.unidade})</span>
                            </div>
                            <button onClick={() => removerExtra(p.id)} className="text-xs text-zinc-400 hover:text-red-600">remover</button>
                          </div>
                          {p.sim_nao ? botoesSimNao(p.id) : (
                            <>
                              <label className="block text-sm text-zinc-500">
                                Em estoque
                                <div className="mt-1">
                                  <EstoqueInput
                                    name={`estoque_${p.id}`}
                                    caixas={valores[p.id] ?? [{ v: "", onde: null }]}
                                    onCaixasChange={(cs) => setCaixas(p.id, cs)}
                                    comLocal
                                  />
                                </div>
                              </label>
                              <AvisoRef id={p.id} />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Adicionar item fora da lista */}
              <div className="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
                {!addAberto ? (
                  <button onClick={() => setAddAberto(true)} className="w-full text-sm font-semibold text-orange-600">
                    <Icone nome="novo" tamanho={14} className="mr-1" /> Tem um item no estoque que não está na lista? Adicionar
                  </button>
                ) : (
                  <div>
                    <div className="flex gap-2">
                      <input
                        value={addBusca}
                        onChange={(e) => setAddBusca(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") buscarAdd(); }}
                        placeholder="Nome do item (ex.: vinagre)"
                        className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <button onClick={buscarAdd} disabled={addBuscando || addBusca.trim().length < 2} className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-marca-sobre-primaria disabled:opacity-50">
                        {addBuscando ? "..." : "Buscar"}
                      </button>
                      <button onClick={() => { setAddAberto(false); setAddBusca(""); setAddResultados([]); }} className="text-zinc-400">✕</button>
                    </div>
                    {addResultados.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {addResultados.map((p) => (
                          <button key={p.id} onClick={() => adicionarExtra(p)} className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-orange-50 dark:border-zinc-700 dark:hover:bg-orange-950">
                            <span>{p.nome} <span className="text-xs text-zinc-400">({p.unidade})</span></span>
                            <span className="text-xs text-zinc-400">{p.categoria}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {!finalizada && produtos.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-xl">
            <div className="mb-1.5 text-center text-xs text-zinc-500">
              {preenchidos} de {todosItens.length} itens preenchidos · não tem nenhum? digite <b>0</b>
              {busca && " · a busca só filtra a tela, nada se perde"}
            </div>
            <button
              onClick={salvar}
              disabled={salvando}
              className="w-full rounded-xl bg-orange-500 px-4 py-3 text-base font-semibold text-marca-sobre-primaria hover:brightness-105 disabled:opacity-60"
            >
              {salvando ? "Enviando..." : `Enviar contagem (${preenchidos})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
