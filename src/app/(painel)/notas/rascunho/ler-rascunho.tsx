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
const paraTexto = (n: number, casas: number) =>
  n ? n.toLocaleString("pt-BR", { minimumFractionDigits: casas === 3 ? 0 : 2, maximumFractionDigits: casas }) : "";
const paraNumero = (s: string) => {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return 0;
  // "1.234,56" → 1234.56; "4.80" (sem vírgula) → 4.8
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Foto do celular é grande: reduz pra caber no envio (lado maior 1800 px, JPG). */
async function reduzir(arquivo: File): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1800 / Math.max(img.width, img.height));
  const w = Math.round(img.width * escala);
  const h = Math.round(img.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  img.close();
  for (const q of [0.85, 0.75, 0.65]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", q));
    if (blob && blob.size < 900_000) return blob;
  }
  throw new Error("grande");
}

let proximoId = 1;

export function LerRascunho({ fornecedores }: { fornecedores: { id: string; nome: string }[] }) {
  const router = useRouter();
  const opcoes: ComboOpt[] = fornecedores.map((f) => ({ value: f.id, label: f.nome }));
  const [fornecedor, setFornecedor] = useState(() => opcoes.find((o) => /horti|frut/i.test(o.label) && !/inativo/.test(o.label))?.value ?? "");
  const [data, setData] = useState(hojeSP);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [totais, setTotais] = useState<number[]>([]);
  const [observacoes, setObservacoes] = useState<string[]>([]);
  const [lendo, setLendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function lerFotos(arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0) return;
    setErro(null);
    const lista = [...arquivos];
    for (let i = 0; i < lista.length; i++) {
      setLendo(lista.length > 1 ? `Lendo a foto ${i + 1} de ${lista.length}…` : "Lendo a foto…");
      try {
        const fd = new FormData();
        fd.append("foto", await reduzir(lista[i]), "rascunho.jpg");
        const r = await lerRascunhoFoto(fd);
        if (!r.ok) { setErro(r.erro); continue; }
        const novas: Linha[] = r.leitura.linhas.map((l) => ({
          id: proximoId++,
          escrito: l.escrito,
          descricao: l.descricao,
          produto: l.produto,
          qtd: paraTexto(l.qtd, 3),
          unidade: l.unidade,
          valor_unit: paraTexto(l.valor_unit, 2),
          valor_total: paraTexto(l.valor_total, 2),
          duvida: l.duvida,
        }));
        setLinhas((v) => [...v, ...novas]);
        if (r.leitura.totalEscrito) setTotais((v) => [...v, r.leitura.totalEscrito as number]);
        if (r.leitura.observacao) setObservacoes((v) => [...v, r.leitura.observacao as string]);
        if (r.leitura.data && r.leitura.data <= hojeSP()) setData(r.leitura.data);
      } catch {
        setErro("Não consegui abrir essa foto. Tire de novo (JPG ou PNG) e tente outra vez.");
      }
    }
    setLendo(null);
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
  const totalEscrito = totais.length ? totais[totais.length - 1] : null;
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
      data,
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
      <div className="cartao grid gap-4 p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <span className="rotulo block">Fornecedor</span>
          <Combobox options={opcoes} value={fornecedor} onChange={setFornecedor} placeholder="Buscar fornecedor…" className="mt-1" />
        </div>
        <label className="block">
          <span className="rotulo block">Dia da entrega</span>
          <input type="date" value={data} max={hojeSP()} onChange={(e) => setData(e.target.value)} className="campo mt-1 w-full" />
        </label>
        <div>
          <span className="rotulo block">Foto da folha</span>
          <label className={`btn-principal mt-1 inline-flex cursor-pointer items-center gap-2 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${lendo ? "pointer-events-none opacity-60" : ""}`}>
            <Icone nome={lendo ? "esperando" : "camera"} tamanho={16} className={lendo ? "animate-spin" : ""} />
            {lendo ?? (linhas.length ? "Ler mais uma folha" : "Tirar / escolher foto")}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={!!lendo}
              onChange={(e) => { void lerFotos(e.target.files); e.target.value = ""; }}
            />
          </label>
          <p className="mt-1 text-xs text-texto-fraco">Pode escolher as duas folhas de uma vez. Foto de cima, com luz, a folha inteira.</p>
        </div>
      </div>

      {erro && <p role="alert" className="pilula pilula-urgente">{erro}</p>}
      {observacoes.map((o, i) => <p key={i} className="pilula pilula-info">{o}</p>)}

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
          <button type="button" className="btn-secundario text-sm" onClick={async () => { if (await confirmar("Tirar todas as linhas lidas?")) { setLinhas([]); setTotais([]); setObservacoes([]); } }}>
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
