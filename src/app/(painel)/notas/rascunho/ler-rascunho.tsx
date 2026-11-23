"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Combobox, type ComboOpt } from "@/components/combobox";
import { BotaoAcao } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { avisar, confirmar } from "@/components/dialogo";
import { moedaBR } from "@/lib/format";
import { linhaFecha, UNIDADES_RASCUNHO, type LinhaRascunho } from "@/lib/rascunho";
import { lerRascunhoFoto, salvarRascunho } from "../actions";

// Cada célula guarda o texto digitado (com vírgula); a conta é feita na hora.
type Linha = {
  id: number;
  escrito: string;
  descricao: string;
  produto: string | null;
  qtd: string;
  unidade: string;
  valor_unit: string;
  valor_total: string;
  duvida: string | null;
};

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Segunda-feira da semana do dia (semana do CMV: segunda → domingo). */
const segundaDe = (iso: string) => somarDias(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
const ddmm = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const paraTexto = (n: number, casas: number) =>
  n ? n.toLocaleString("pt-BR", { minimumFractionDigits: casas === 3 ? 0 : 2, maximumFractionDigits: casas }) : "";
const paraNumero = (s: string) => {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return 0;
  // "1.234,56" → 1234.56; "4.80" (sem vírgula) → 4.8
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : NaN;
};

const MAX_FOLHAS = 4;
// A server action aceita até 1 MB por envio: as folhas dividem esse espaço.
const LIMITE_ENVIO = 950_000;

/** Foto do celular é grande: reduz pra caber no envio (JPG; diminui até caber). */
async function reduzir(arquivo: File, maxBytes: number): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  try {
    for (const lado of [1800, 1500, 1250]) {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.85, 0.75, 0.65]) {
        const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", q));
        if (blob && blob.size < maxBytes) return blob;
      }
    }
  } finally {
    img.close();
  }
  throw new Error("grande");
}

let proximoId = 1;

export function LerRascunho({ fornecedores }: { fornecedores: { id: string; nome: string }[] }) {
  const router = useRouter();
  const opcoes: ComboOpt[] = fornecedores.map((f) => ({ value: f.id, label: f.nome }));
  const [fornecedor, setFornecedor] = useState(() => opcoes.find((o) => /horti|frut/i.test(o.label) && !/inativo/.test(o.label))?.value ?? "");
  // O rascunho chega no fim de semana: até terça, o padrão é a semana passada.
  const [semana, setSemana] = useState(() => segundaDe(somarDias(hojeSP(), -2)));
  const semanas = Array.from({ length: 8 }, (_, i) => somarDias(segundaDe(hojeSP()), -7 * i));
  const [folhas, setFolhas] = useState<{ id: number; arquivo: File; url: string }[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [totalEscrito, setTotalEscrito] = useState<number | null>(null);
  const [observacao, setObservacao] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function juntarFolhas(arquivos: FileList | null) {
    if (!arquivos) return;
    setErro(null);
    const novas = [...arquivos].map((arquivo) => ({ id: proximoId++, arquivo, url: URL.createObjectURL(arquivo) }));
    setFolhas((v) => {
      const todas = [...v, ...novas];
      if (todas.length > MAX_FOLHAS) setErro(`No máximo ${MAX_FOLHAS} folhas por rascunho.`);
      for (const f of todas.slice(MAX_FOLHAS)) URL.revokeObjectURL(f.url);
      return todas.slice(0, MAX_FOLHAS);
    });
  }

  function tirarFolha(id: number) {
    setFolhas((v) => {
      const f = v.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.url);
      return v.filter((x) => x.id !== id);
    });
  }

  /** Todas as folhas vão juntas numa leitura só (o total da última vale pelo rascunho). */
  async function lerFolhas() {
    if (folhas.length === 0) return;
    if (linhas.length && !(await confirmar("Ler de novo? As linhas lidas e corrigidas até agora serão trocadas.", { okTexto: "Ler de novo" }))) return;
    setErro(null);
    setLendo(true);
    try {
      const fd = new FormData();
      for (const f of folhas) fd.append("foto", await reduzir(f.arquivo, Math.floor(LIMITE_ENVIO / folhas.length)), "folha.jpg");
      const r = await lerRascunhoFoto(fd);
      if (!r.ok) { setErro(r.erro); return; }
      setLinhas(r.leitura.linhas.map((l) => ({
        id: proximoId++,
        escrito: l.escrito,
        descricao: l.descricao,
        produto: l.produto,
        qtd: paraTexto(l.qtd, 3),
        unidade: l.unidade,
        valor_unit: paraTexto(l.valor_unit, 2),
        valor_total: paraTexto(l.valor_total, 2),
        duvida: l.duvida,
      })));
      setTotalEscrito(r.leitura.totalEscrito);
      setObservacao(r.leitura.observacao);
      if (r.leitura.data && r.leitura.data <= hojeSP()) setSemana(segundaDe(r.leitura.data));
    } catch {
      setErro("Não consegui abrir as fotos. Tire de novo (JPG ou PNG) e tente outra vez.");
    } finally {
      setLendo(false);
    }
  }

  const mudar = (id: number, campo: keyof Linha, valor: string) =>
    setLinhas((v) => v.map((l) => (l.id === id ? { ...l, [campo]: valor, ...(campo === "descricao" ? { produto: null } : {}) } : l)));

  const contas = linhas.map((l) => {
    const qtd = paraNumero(l.qtd);
    const unit = paraNumero(l.valor_unit);
    const total = paraNumero(l.valor_total);
    const ok = qtd > 0 && total > 0 && unit >= 0 && linhaFecha({ qtd, valor_unit: unit, valor_total: total });
    return { qtd, unit, total, ok, conta: Math.round(qtd * unit * 100) / 100 };
  });
  const soma = Math.round(contas.reduce((s, c) => s + (Number.isFinite(c.total) ? c.total : 0), 0) * 100) / 100;
  const difTotal = totalEscrito != null ? Math.round((soma - totalEscrito) * 100) / 100 : null;
  const problemas = contas.filter((c) => !c.ok).length;

  async function salvar() {
    if (!fornecedor) return avisar("Escolha o fornecedor.");
    if (problemas > 0) return avisar(`${problemas} linha(s) com a conta que não fecha.`, "Corrija a quantidade, o preço ou o total (o que estiver errado na foto) antes de salvar.");
    if (difTotal != null && Math.abs(difTotal) > 0.05) {
      const seguir = await confirmar(
        `A soma das linhas dá ${moedaBR(soma)}, mas a folha diz ${moedaBR(totalEscrito!)}.`,
        { detalhe: "Pode ser erro de conta de quem escreveu, ou alguma linha lida errado. Salvar assim mesmo?", okTexto: "Salvar assim" },
      );
      if (!seguir) return;
    }
    const r = await salvarRascunho({
      fornecedorId: fornecedor,
      semana,
      linhas: linhas.map((l, i): LinhaRascunho => ({
        escrito: l.escrito,
        descricao: l.descricao,
        produto: l.produto,
        qtd: contas[i].qtd,
        unidade: l.unidade,
        valor_unit: contas[i].unit,
        valor_total: contas[i].total,
        duvida: null,
      })),
    });
    if (!r.ok) return avisar(r.erro);
    router.push(`/notas/${r.notaId}`);
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="cartao grid gap-4 p-5 md:grid-cols-2">
        <div>
          <span className="rotulo block">Fornecedor</span>
          <Combobox options={opcoes} value={fornecedor} onChange={setFornecedor} placeholder="Buscar fornecedor…" className="mt-1" />
        </div>
        <label className="block">
          <span className="rotulo block">Semana do rascunho</span>
          <select value={semana} onChange={(e) => setSemana(e.target.value)} className="campo mt-1 w-full">
            {semanas.map((s, i) => (
              <option key={s} value={s}>
                {ddmm(s)} a {ddmm(somarDias(s, 6))}{i === 0 ? " (esta semana)" : i === 1 ? " (semana passada)" : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-texto-fraco">A compra entra no CMV dessa semana (segunda a domingo).</span>
        </label>

        <div className="md:col-span-2">
          <span className="rotulo block">Folhas do rascunho</span>
          <div className="mt-2 flex flex-wrap items-start gap-3">
            {folhas.map((f, i) => (
              <figure key={f.id} className="relative w-28">
                {/* eslint-disable-next-line @next/next/no-img-element -- prévia local da foto escolhida */}
                <img src={f.url} alt={`Folha ${i + 1}`} className="h-36 w-28 rounded-controle object-cover" />
                <figcaption className="mt-1 text-center text-xs text-texto-suave">Folha {i + 1}</figcaption>
                <button
                  type="button"
                  aria-label={`Tirar a folha ${i + 1}`}
                  onClick={() => tirarFolha(f.id)}
                  disabled={lendo}
                  className="btn-secundario absolute right-1 top-1 min-h-11 px-3 text-sm"
                >
                  <Icone nome="fechar" tamanho={14} />
                </button>
              </figure>
            ))}
            {folhas.length < MAX_FOLHAS && (
              <label className={`btn-secundario flex h-36 w-28 cursor-pointer flex-col items-center justify-center gap-2 text-center text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${lendo ? "pointer-events-none opacity-60" : ""}`}>
                <Icone nome="camera" tamanho={22} />
                {folhas.length ? "Mais uma folha" : "Tirar / escolher foto"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={lendo}
                  onChange={(e) => { juntarFolhas(e.target.files); e.target.value = ""; }}
                />
              </label>
            )}
          </div>
          <p className="mt-2 text-xs text-texto-fraco">
            Coloque todas as folhas da semana (uma foto por folha, de cima, com luz, a folha inteira). Elas são lidas juntas, como um rascunho só.
          </p>
          {folhas.length > 0 && (
            <button type="button" onClick={() => void lerFolhas()} disabled={lendo} className="btn-principal mt-3 inline-flex items-center gap-2 text-sm">
              <Icone nome={lendo ? "esperando" : "ver"} tamanho={16} className={lendo ? "animate-spin" : ""} />
              {lendo ? "Lendo… (até 1 minuto)" : folhas.length > 1 ? `Ler as ${folhas.length} folhas` : "Ler a folha"}
            </button>
          )}
        </div>
      </div>

      {erro && <p role="alert" className="pilula pilula-urgente">{erro}</p>}
      {observacao && <p className="pilula pilula-info">{observacao}</p>}

      {linhas.length > 0 && (
        <div className="cartao overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left">
                <th className="rotulo px-4 py-3">Produto</th>
                <th className="rotulo px-2 py-3 text-right">Quantidade</th>
                <th className="rotulo px-2 py-3">Un.</th>
                <th className="rotulo px-2 py-3 text-right">Preço (R$)</th>
                <th className="rotulo px-2 py-3 text-right">Total (R$)</th>
                <th className="px-4 py-3"><span className="sr-only">Tirar</span></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const c = contas[i];
                return (
                  <tr key={l.id} className={`border-t border-borda align-top ${c.ok ? "" : "bg-destaque"}`}>
                    <td className="px-4 py-2">
                      <input aria-label={`Produto da linha ${i + 1}`} value={l.descricao} onChange={(e) => mudar(l.id, "descricao", e.target.value)} className="campo w-full" />
                      <p className="mt-1 text-xs text-texto-fraco">
                        Na folha: “{l.escrito}”
                        {l.produto && <> · <span className="text-texto-suave">cadastro: {l.produto}</span></>}
                      </p>
                      {l.duvida && <p className="mt-1 text-xs text-texto-suave"><Icone nome="duvida" tamanho={12} /> {l.duvida}</p>}
                    </td>
                    <td className="px-2 py-2"><input aria-label={`Quantidade da linha ${i + 1}`} inputMode="decimal" value={l.qtd} onChange={(e) => mudar(l.id, "qtd", e.target.value)} className="campo w-24 text-right font-numero" /></td>
                    <td className="px-2 py-2">
                      <select aria-label={`Unidade da linha ${i + 1}`} value={l.unidade} onChange={(e) => mudar(l.id, "unidade", e.target.value)} className="campo w-20">
                        {UNIDADES_RASCUNHO.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2"><input aria-label={`Preço da linha ${i + 1}`} inputMode="decimal" value={l.valor_unit} onChange={(e) => mudar(l.id, "valor_unit", e.target.value)} className="campo w-24 text-right font-numero" /></td>
                    <td className="px-2 py-2 text-right">
                      <input aria-label={`Total da linha ${i + 1}`} inputMode="decimal" value={l.valor_total} onChange={(e) => mudar(l.id, "valor_total", e.target.value)} className="campo w-28 text-right font-numero" />
                      {!c.ok && Number.isFinite(c.conta) && c.conta > 0 && (
                        <button type="button" className="mt-1 block w-full text-right text-xs font-semibold text-texto-marca hover:underline" onClick={() => mudar(l.id, "valor_total", paraTexto(c.conta, 2))}>
                          conta dá {moedaBR(c.conta)}: usar
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" aria-label={`Tirar a linha ${i + 1}`} onClick={() => setLinhas((v) => v.filter((x) => x.id !== l.id))} className="btn-secundario min-h-11 px-3 text-sm">
                        <Icone nome="fechar" tamanho={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borda px-4 py-3">
            <button
              type="button"
              className="btn-secundario text-sm"
              onClick={() => setLinhas((v) => [...v, { id: proximoId++, escrito: "(digitado)", descricao: "", produto: null, qtd: "", unidade: "KG", valor_unit: "", valor_total: "", duvida: null }])}
            >
              <Icone nome="novo" tamanho={15} /> Adicionar linha
            </button>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {problemas > 0 && <span className="pilula pilula-urgente">{problemas} linha(s) não fecham</span>}
              {totalEscrito != null && (
                Math.abs(difTotal ?? 0) <= 0.05
                  ? <span className="pilula pilula-ok">bate com o total da folha</span>
                  : <span className="pilula pilula-urgente">folha diz {moedaBR(totalEscrito)} ({difTotal! > 0 ? "+" : ""}{moedaBR(difTotal!)})</span>
              )}
              <span className="rotulo">{linhas.length} itens</span>
              <span className="numero-grande text-2xl">{moedaBR(soma)}</span>
            </div>
          </div>
        </div>
      )}

      {linhas.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button type="button" className="btn-secundario text-sm" onClick={async () => { if (await confirmar("Tirar todas as linhas lidas?")) { setLinhas([]); setTotalEscrito(null); setObservacao(null); } }}>
            Começar de novo
          </button>
          <BotaoAcao className="btn-principal text-sm" aoClicar={salvar}>
            <Icone nome="certo" tamanho={16} /> Salvar como nota pendente
          </BotaoAcao>
        </div>
      )}
    </div>
  );
}
