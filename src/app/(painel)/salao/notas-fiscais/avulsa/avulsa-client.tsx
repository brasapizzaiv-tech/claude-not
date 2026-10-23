"use client";

// Tela da nota avulsa (migration 0248). Quatro passos numa coluna: tipo de nota,
// quem compra (com busca do CNPJ na Receita), itens (ou "puxar compras do
// período", que no Kern traz as marmitas do convênio) e pagamento + emitir.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { avisar, confirmar } from "@/components/dialogo";
import { Icone } from "@/components/icone";
import { FORMAS_NOTA, conferirNota, totalLinhas, type DestNota, type LinhaNota, type ModeloNota } from "@/lib/fiscal/avulsa";
import { buscarClientesNota, buscarCnpjNota, comprasDoCliente, consultarNotaAvulsa, emitirNotaAvulsa, salvarClienteNota } from "./actions";

export type ClienteNota = {
  id: string; nome: string; cpf_cnpj: string | null; ie: string | null; indicador_ie: "1" | "2" | "9" | null;
  logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null;
  municipio: string | null; uf: string | null; cep: string | null; email: string | null; telefone: string | null;
};
export type ItemCardapio = { id: string; nome: string; preco: number; categoria: string | null };
export type PerfilOpcao = { id: string; nome: string; cfop: string; csosn: string; ncm: string | null };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const campo = "w-full min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto focus:border-primaria";
const rotuloCampo = "text-xs text-texto-suave";
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const hojeBR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const primeiroDoMes = () => hojeBR().slice(0, 8) + "01";
const dataBR = (d: string) => d.split("-").reverse().join("/");

const destVazio = (): DestNota => ({
  clienteId: null, doc: "", nome: "", ie: "", indicadorIe: "9", logradouro: "", numero: "", complemento: "",
  bairro: "", municipio: "", uf: "RS", cep: "", email: "", telefone: "",
});
const destDoCliente = (c: ClienteNota): DestNota => ({
  clienteId: c.id, doc: dig(c.cpf_cnpj), nome: c.nome, ie: dig(c.ie),
  indicadorIe: c.indicador_ie ?? (dig(c.ie) ? "1" : "9"),
  logradouro: c.logradouro ?? "", numero: c.numero ?? "", complemento: c.complemento ?? "", bairro: c.bairro ?? "",
  municipio: c.municipio ?? "", uf: (c.uf ?? "RS").toUpperCase(), cep: dig(c.cep), email: c.email ?? "", telefone: dig(c.telefone),
});

type Linha = LinhaNota & { k: number; qtdTxt: string; valorTxt: string };
let seq = 0;
const linhaNova = (l?: Partial<LinhaNota>): Linha => ({
  k: ++seq, itemId: l?.itemId ?? null, descricao: l?.descricao ?? "", qtd: l?.qtd ?? 1, valorUnit: l?.valorUnit ?? 0, perfilId: l?.perfilId ?? null,
  qtdTxt: String(l?.qtd ?? 1).replace(".", ","), valorTxt: l?.valorUnit ? l.valorUnit.toFixed(2).replace(".", ",") : "",
});

type Resultado = {
  autorizado: boolean; id: string | null; status: string | null; numero: string | null; serie: string | null;
  urlDanfe: string | null; urlXml: string | null; ambiente: string | null; mensagem: string | null; erros: string | null;
};

export function AvulsaClient({ itens, perfis, producao, podeTeste }: {
  itens: ItemCardapio[]; perfis: PerfilOpcao[]; producao: boolean; podeTeste: boolean;
}) {
  const router = useRouter();
  const [modelo, setModelo] = useState<ModeloNota>("nfe");
  const [teste, setTeste] = useState(!producao);
  const [dest, setDest] = useState<DestNota>(destVazio);
  const [buscaCli, setBuscaCli] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([linhaNova()]);
  const [forma, setForma] = useState("05");
  const [obs, setObs] = useState("");
  const [de, setDe] = useState(primeiroDoMes());
  const [ate, setAte] = useState(hojeBR());
  const [soSaldo, setSoSaldo] = useState(true);
  const [comandaIds, setComandaIds] = useState<string[]>([]);
  const [infoPuxar, setInfoPuxar] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const setD = (k: keyof DestNota, v: string) => setDest((d) => ({ ...d, [k]: v }));
  const itemPorNome = useMemo(() => new Map(itens.map((i) => [i.nome.toLowerCase(), i])), [itens]);
  // Busca no banco (todos os clientes), um instante depois de parar de digitar.
  const [sugestoesCli, setSugestoesCli] = useState<ClienteNota[]>([]);
  useEffect(() => {
    const q = buscaCli.trim();
    if (q.length < 2) return;
    let vivo = true;
    const t = setTimeout(() => { void buscarClientesNota(q).then((r) => { if (vivo) setSugestoesCli(r); }); }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [buscaCli]);
  const mostrarSugestoes = buscaCli.trim().length >= 2 && sugestoesCli.length > 0;

  const linhasNota: LinhaNota[] = linhas.map(({ itemId, descricao, qtd, valorUnit, perfilId }) => ({ itemId, descricao, qtd, valorUnit, perfilId }));
  const total = totalLinhas(linhasNota);
  const pendencias = conferirNota(modelo, dest, linhasNota);

  function escolherCliente(c: ClienteNota) {
    setDest(destDoCliente(c));
    setBuscaCli("");
    setComandaIds([]);
    setInfoPuxar(null);
  }

  async function buscarReceita() {
    const r = await buscarCnpjNota(dest.doc);
    if (!r.ok) { void avisar(r.mensagem); return; }
    const x = r.dados;
    if (x.situacao && x.situacao.toUpperCase() !== "ATIVA") void avisar(`Atenção: na Receita esse CNPJ está "${x.situacao}".`);
    setDest((d) => ({
      ...d, doc: x.cnpj, nome: x.razao_social || d.nome, logradouro: x.logradouro, numero: x.numero,
      complemento: x.complemento ?? "", bairro: x.bairro, municipio: x.municipio, uf: x.uf, cep: x.cep,
      email: d.email || x.email || "", telefone: d.telefone || x.telefone || "",
      ie: x.ie ?? d.ie, indicadorIe: x.ie ? "1" : d.indicadorIe,
    }));
  }

  async function puxar() {
    if (!dest.clienteId) { void avisar("Escolha um cliente cadastrado (ou salve este) antes de puxar as compras."); return; }
    const r = await comprasDoCliente(dest.clienteId, de, ate, soSaldo);
    if (!r.ok) { void avisar(r.mensagem); return; }
    if (r.linhas.length === 0) { setInfoPuxar("Nenhuma compra desse cliente no período."); return; }
    setLinhas(r.linhas.map((l) => linhaNova(l)));
    setComandaIds(r.comandaIds);
    setInfoPuxar(`${r.comandaIds.length} comanda(s) de ${dataBR(de)} a ${dataBR(ate)}, total ${brl(r.total)}.` +
      (r.jaFaturadas ? ` ATENÇÃO: ${r.jaFaturadas} delas já entraram numa nota avulsa — confira pra não faturar duas vezes.` : ""));
    if (!obs.trim()) setObs(`Referente a fornecimento de refeições de ${dataBR(de)} a ${dataBR(ate)}.`);
  }

  function mudarLinha(k: number, patch: Partial<Linha>) {
    setLinhas((ls) => ls.map((l) => (l.k === k ? { ...l, ...patch } : l)));
  }
  function descricaoMudou(k: number, txt: string) {
    const it = itemPorNome.get(txt.trim().toLowerCase());
    mudarLinha(k, it
      ? { descricao: it.nome, itemId: it.id, valorUnit: it.preco, valorTxt: it.preco.toFixed(2).replace(".", ",") }
      : { descricao: txt, itemId: null });
  }

  async function emitir() {
    if (pendencias.length) { void avisar(pendencias.join("\n")); return; }
    const tipo = modelo === "nfe" ? "NF-e" : "NFC-e";
    const quem = dest.nome.trim() || "consumidor";
    const ok = await confirmar(
      teste ? `Emitir ${tipo} de TESTE (sem valor fiscal) de ${brl(total)} para ${quem}?` : `Emitir ${tipo} de ${brl(total)} para ${quem}?`,
      { detalhe: teste ? undefined : "Ela vale na SEFAZ. Pra desfazer, só cancelando (até 24 h).", perigo: !teste, okTexto: `Emitir ${tipo}` },
    );
    if (!ok) return;
    let d = dest;
    if (modelo === "nfe" || dest.clienteId) {
      const s = await salvarClienteNota(dest);
      if (!s.ok) { void avisar(s.mensagem); return; }
      d = { ...dest, clienteId: s.id };
      setDest(d);
    }
    const r = await emitirNotaAvulsa({ modelo, teste, dest: d, linhas: linhasNota, forma, observacao: obs, comandaIds });
    setResultado({
      autorizado: !!r.autorizado, id: r.id ?? null, status: r.status ?? null, numero: r.numero ?? null, serie: r.serie ?? null,
      urlDanfe: r.urlDanfe ?? null, urlXml: r.urlXml ?? null, ambiente: r.ambiente ?? null, mensagem: r.mensagem ?? null, erros: r.erros ?? null,
    });
    router.refresh();
  }

  async function consultar() {
    if (!resultado?.id) return;
    const r = await consultarNotaAvulsa(resultado.id);
    if (!r.ok && !r.status) { void avisar(r.mensagem ?? "Não consegui consultar."); return; }
    setResultado((x) => (x ? { ...x, status: r.status, numero: r.numero, urlDanfe: r.urlDanfe, mensagem: r.mensagem, autorizado: r.status === "autorizado" } : x));
  }

  return (
    <div className="mt-5 grid max-w-5xl gap-4">
      {/* 1. tipo */}
      <section className="cartao p-5">
        <p className="rotulo mb-3">1 · Tipo de nota</p>
        <div className="flex flex-wrap gap-2">
          {([["nfe", "NF-e · empresa (modelo 55)"], ["nfce", "NFC-e · consumidor (modelo 65)"]] as const).map(([v, t]) => (
            <button key={v} type="button" onClick={() => { setModelo(v); setForma(v === "nfe" ? "05" : "01"); }}
              className={`min-h-11 rounded-full px-4 text-sm font-semibold ${modelo === v ? "bg-texto text-fundo" : "bg-painel-cartao text-texto shadow-controle"}`}>
              {t}
            </button>
          ))}
        </div>
        {podeTeste && (
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-texto">
            <input type="checkbox" checked={teste} onChange={(e) => setTeste(e.target.checked)} className="h-5 w-5" />
            Nota de teste (homologação, sem valor fiscal)
          </label>
        )}
        {!teste && producao && <p className="mt-2 text-xs text-texto-suave"><span className="pilula pilula-urgente">valendo</span> A nota sai em produção e vale na SEFAZ.</p>}
      </section>

      {/* 2. quem compra */}
      <section className="cartao p-5">
        <p className="rotulo mb-3">2 · Quem compra {modelo === "nfce" && <span className="normal-case tracking-normal">(opcional na NFC-e)</span>}</p>
        <div className="relative">
          <input value={buscaCli} onChange={(e) => setBuscaCli(e.target.value)} placeholder="Buscar cliente cadastrado (nome ou CNPJ)…" aria-label="Buscar cliente" className={campo} />
          {mostrarSugestoes && (
            <ul className="cartao absolute z-20 mt-1 w-full overflow-hidden p-1">
              {sugestoesCli.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => escolherCliente(c)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-controle px-3 text-left text-sm hover:bg-superficie-suave">
                    <span className="font-medium text-texto">{c.nome}</span>
                    <span className="shrink-0 text-xs text-texto-fraco">{c.cpf_cnpj || "sem CNPJ"}{c.bairro ? ` · ${c.bairro}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {dest.clienteId && <p className="mt-2 text-xs text-texto-suave">Cliente do cadastro. O que mudar aqui fica salvo nele ao emitir. <button type="button" className="font-semibold text-texto-marca hover:underline" onClick={() => { setDest(destVazio()); setComandaIds([]); setInfoPuxar(null); }}>Limpar</button></p>}

        <div className="mt-3 grid gap-3 sm:grid-cols-6">
          <label className={`${rotuloCampo} sm:col-span-2`}>CNPJ ou CPF
            <div className="mt-1 flex gap-2">
              <input value={dest.doc} onChange={(e) => setD("doc", e.target.value)} inputMode="numeric" placeholder="00.000.000/0000-00" className={campo} />
              {dig(dest.doc).length === 14 && (
                <BotaoAcao aoClicar={buscarReceita} className="btn-secundario !min-h-11 shrink-0 text-sm" title="Preenche nome e endereço pela Receita">Buscar</BotaoAcao>
              )}
            </div>
          </label>
          <label className={`${rotuloCampo} sm:col-span-4`}>Razão social / nome
            <input value={dest.nome} onChange={(e) => setD("nome", e.target.value)} className={`${campo} mt-1`} />
          </label>
          {modelo === "nfe" && (
            <>
              <label className={`${rotuloCampo} sm:col-span-2`}>Inscrição estadual
                <select value={dest.indicadorIe} onChange={(e) => setD("indicadorIe", e.target.value)} className={`${campo} mt-1`}>
                  <option value="1">Tem inscrição estadual</option>
                  <option value="2">Isento</option>
                  <option value="9">Não contribuinte</option>
                </select>
              </label>
              <label className={`${rotuloCampo} sm:col-span-2`}>Número da IE
                <input value={dest.ie} onChange={(e) => setD("ie", e.target.value)} disabled={dest.indicadorIe !== "1"} inputMode="numeric" className={`${campo} mt-1 disabled:opacity-50`} />
              </label>
              <label className={`${rotuloCampo} sm:col-span-2`}>CEP
                <input value={dest.cep} onChange={(e) => setD("cep", e.target.value)} inputMode="numeric" className={`${campo} mt-1`} />
              </label>
              <label className={`${rotuloCampo} sm:col-span-4`}>Rua
                <input value={dest.logradouro} onChange={(e) => setD("logradouro", e.target.value)} className={`${campo} mt-1`} />
              </label>
              <label className={`${rotuloCampo} sm:col-span-1`}>Número
                <input value={dest.numero} onChange={(e) => setD("numero", e.target.value)} className={`${campo} mt-1`} />
              </label>
              <label className={`${rotuloCampo} sm:col-span-1`}>Compl.
                <input value={dest.complemento} onChange={(e) => setD("complemento", e.target.value)} className={`${campo} mt-1`} />
              </label>
              <label className={`${rotuloCampo} sm:col-span-2`}>Bairro
                <input value={dest.bairro} onChange={(e) => setD("bairro", e.target.value)} className={`${campo} mt-1`} />
              </label>
              <label className={`${rotuloCampo} sm:col-span-3`}>Cidade
                <input value={dest.municipio} onChange={(e) => setD("municipio", e.target.value)} className={`${campo} mt-1`} />
              </label>
              <label className={`${rotuloCampo} sm:col-span-1`}>UF
                <input value={dest.uf} onChange={(e) => setD("uf", e.target.value.toUpperCase().slice(0, 2))} className={`${campo} mt-1`} />
              </label>
              <label className={`${rotuloCampo} sm:col-span-3`}>E-mail (o Focus manda a nota pra ele)
                <input value={dest.email} onChange={(e) => setD("email", e.target.value)} type="email" className={`${campo} mt-1`} />
              </label>
              <label className={`${rotuloCampo} sm:col-span-3`}>Telefone
                <input value={dest.telefone} onChange={(e) => setD("telefone", e.target.value)} inputMode="tel" className={`${campo} mt-1`} />
              </label>
            </>
          )}
        </div>
      </section>

      {/* 3. itens */}
      <section className="cartao p-5">
        <p className="rotulo mb-3">3 · Itens</p>
        <div className="mb-4 rounded-controle bg-superficie-suave p-4">
          <p className="text-sm font-semibold text-texto">Puxar o que o cliente comprou no período</p>
          <p className="text-xs text-texto-suave">Junta as comandas fechadas no nome dele (no Kern, as marmitas do convênio).</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className={rotuloCampo}>De<input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={`${campo} mt-1`} /></label>
            <label className={rotuloCampo}>Até<input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={`${campo} mt-1`} /></label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-texto">
              <input type="checkbox" checked={soSaldo} onChange={(e) => setSoSaldo(e.target.checked)} className="h-5 w-5" /> Só o que foi no saldo cliente (a faturar)
            </label>
            <BotaoAcao aoClicar={puxar} disabled={!dest.clienteId} className="btn-secundario !min-h-11 text-sm">Puxar compras</BotaoAcao>
          </div>
          {!dest.clienteId && <p className="mt-2 text-xs text-texto-fraco">Escolha um cliente cadastrado no passo 2 pra puxar.</p>}
          {infoPuxar && <p className={`mt-2 text-sm ${infoPuxar.includes("ATENÇÃO") ? "font-semibold text-urgente-texto" : "text-texto"}`}>{infoPuxar}</p>}
        </div>

        <datalist id="itens-cardapio">{itens.map((i) => <option key={i.id} value={i.nome} />)}</datalist>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="rotulo text-left">
              <tr><th className="py-2 pr-2">Descrição</th><th className="w-24 py-2 pr-2 text-right">Qtd</th><th className="w-32 py-2 pr-2 text-right">Valor un.</th><th className="w-44 py-2 pr-2">Perfil fiscal</th><th className="w-28 py-2 text-right">Total</th><th className="w-11" /></tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map((l) => (
                <tr key={l.k}>
                  <td className="py-2 pr-2"><input list="itens-cardapio" value={l.descricao} onChange={(e) => descricaoMudou(l.k, e.target.value)} placeholder="Item do cardápio ou texto livre" aria-label="Descrição" className={campo} /></td>
                  <td className="py-2 pr-2"><input value={l.qtdTxt} onChange={(e) => mudarLinha(l.k, { qtdTxt: e.target.value, qtd: num(e.target.value) })} inputMode="decimal" aria-label="Quantidade" className={`${campo} text-right`} /></td>
                  <td className="py-2 pr-2"><input value={l.valorTxt} onChange={(e) => mudarLinha(l.k, { valorTxt: e.target.value, valorUnit: num(e.target.value) })} inputMode="decimal" placeholder="0,00" aria-label="Valor unitário" className={`${campo} text-right`} /></td>
                  <td className="py-2 pr-2">
                    <select value={l.perfilId ?? ""} onChange={(e) => mudarLinha(l.k, { perfilId: e.target.value || null })} aria-label="Perfil fiscal" className={campo}>
                      <option value="">{l.itemId ? "o do cardápio" : "padrão (buffet)"}</option>
                      {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </td>
                  <td className="py-2 text-right font-numero font-semibold text-texto">{brl(l.qtd * l.valorUnit)}</td>
                  <td className="py-2 text-right">
                    <button type="button" onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((x) => x.k !== l.k) : [linhaNova()]))} aria-label="Tirar item" className="flex h-11 w-11 items-center justify-center rounded-controle text-texto-fraco hover:bg-superficie-suave hover:text-urgente-texto"><Icone nome="fechar" tamanho={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setLinhas((ls) => [...ls, linhaNova()])} className="btn-secundario mt-3 !min-h-11 text-sm">+ item</button>
      </section>

      {/* 4. pagamento e emitir */}
      <section className="cartao p-5">
        <p className="rotulo mb-3">4 · Pagamento e observação</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={rotuloCampo}>Forma de pagamento
            <select value={forma} onChange={(e) => setForma(e.target.value)} className={`${campo} mt-1`}>
              {FORMAS_NOTA.map((f) => <option key={f.cod} value={f.cod}>{f.nome}</option>)}
            </select>
          </label>
          {modelo === "nfe" && (
            <label className={`${rotuloCampo} sm:col-span-2`}>Observação na nota (informações complementares)
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className="mt-1 w-full rounded-controle border border-borda-forte bg-painel-cartao px-3 py-2 text-sm text-texto" />
            </label>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-borda pt-4">
          <div>
            <p className="rotulo">Total da nota</p>
            <p className="numero-grande text-[30px] text-texto">{brl(total)}</p>
          </div>
          <BotaoAcao aoClicar={emitir} className="btn-principal text-sm">
            {teste ? "Emitir nota de teste" : `Emitir ${modelo === "nfe" ? "NF-e" : "NFC-e"}`}
          </BotaoAcao>
        </div>
        {pendencias.length > 0 && (
          <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-texto-suave">
            {pendencias.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
      </section>

      {resultado && (
        <section className={`cartao p-5 ${resultado.autorizado ? "shadow-[inset_0_0_0_2px_var(--marca-primaria)]" : ""}`} role="status">
          {resultado.autorizado ? (
            <>
              <p className="pilula pilula-ok inline-block">autorizada{resultado.ambiente === "homologacao" ? " · teste" : ""}</p>
              <p className="mt-2 font-numero text-xl font-bold text-texto">Nota nº {resultado.numero}{resultado.serie ? ` · série ${resultado.serie}` : ""}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {resultado.urlDanfe && <a href={resultado.urlDanfe} target="_blank" rel="noopener noreferrer" className="btn-principal text-sm">Abrir a nota (PDF)</a>}
                {resultado.urlXml && <a href={resultado.urlXml} target="_blank" rel="noopener noreferrer" className="btn-secundario text-sm">XML</a>}
              </div>
            </>
          ) : resultado.status === "processando_autorizacao" ? (
            <>
              <p className="pilula inline-block">processando na SEFAZ</p>
              <p className="mt-2 text-sm text-texto">A SEFAZ ainda está processando. Consulte de novo em alguns segundos.</p>
              <BotaoAcao aoClicar={consultar} className="btn-secundario mt-3 text-sm">Consultar de novo</BotaoAcao>
            </>
          ) : (
            <>
              <p className="pilula pilula-urgente inline-block">não autorizada</p>
              <p className="mt-2 text-sm text-texto">{resultado.mensagem || "A nota não foi autorizada."}</p>
              {resultado.erros && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-controle bg-superficie-suave p-3 text-xs text-texto-suave">{resultado.erros}</pre>}
            </>
          )}
        </section>
      )}
    </div>
  );
}
