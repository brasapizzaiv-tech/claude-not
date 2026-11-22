"use client";

// Janela "Arquivo Pix" da tela Semana: monta o arquivo de remessa CNAB 240 do
// Sicoob com quem tem valor a receber e chave Pix no cadastro. O dono importa o
// arquivo no Internet Banking e aprova lá — daqui não sai dinheiro nenhum.
import { useEffect, useMemo, useState, useTransition } from "react";
import { Janela } from "@/components/janela";
import { Icone } from "@/components/icone";
import { brl } from "@/lib/equipe";
import { gerarArquivoPix, lerPixLote, salvarPixLoteConfig, type ArquivoGerado, type ConfigPixLote } from "./pix-lote-actions";

export type CandidatoPix = {
  id: string;
  nome: string;
  valor: number; // o que vai na mão da pessoa (já sem adiantamento/fiado)
  temChave: boolean;
  temCpf: boolean; // o Sicoob exige o CPF de quem recebe, mesmo com chave de celular/e-mail
  tipoChave: string | null;
  jaLancado: boolean;
  emDinheiro: boolean; // vai sair do cofre (envelope): começa desmarcado
};

const CAMPOS: { k: keyof ConfigPixLote; rotulo: string; dica?: string; largura?: string }[] = [
  { k: "convenio", rotulo: "Código do convênio", dica: "Aparece no Internet Banking depois da adesão ao CNAB 240." },
  { k: "nome_empresa", rotulo: "Nome da empresa", dica: "Como está no banco.", largura: "sm:col-span-2" },
  { k: "cnpj", rotulo: "CNPJ" },
  { k: "agencia", rotulo: "Agência" },
  { k: "agencia_dv", rotulo: "Dígito da agência", dica: "Se não tiver, deixe em branco." },
  { k: "conta", rotulo: "Conta (sem o dígito)" },
  { k: "conta_dv", rotulo: "Dígito da conta" },
];

const pode = (c: CandidatoPix) => c.temChave && c.temCpf;

function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ArquivoPix({ segunda, candidatos, onFechar }: { segunda: string; candidatos: CandidatoPix[]; onFechar: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<ConfigPixLote | null>(null);
  const [pronta, setPronta] = useState(false);
  const [podeEditar, setPodeEditar] = useState(false);
  const [ultimos, setUltimos] = useState<ArquivoGerado[]>([]);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [data, setData] = useState(hojeLocal);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(candidatos.filter((c) => pode(c) && !c.emDinheiro && c.valor > 0.005).map((c) => c.id)));
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ nome: string; qtd: number; total: number; fora: string[] } | null>(null);
  const [pending, start] = useTransition();

  function aplicar(r: Awaited<ReturnType<typeof lerPixLote>>) {
    setConfig(r.config);
    setPronta(r.pronta);
    setPodeEditar(r.podeEditar);
    setUltimos(r.ultimos);
    setForm(Object.fromEntries(CAMPOS.map((c) => [c.k, String(r.config?.[c.k] ?? "")])));
    setEditando(!r.pronta && r.podeEditar);
    setCarregando(false);
  }
  async function recarregar() {
    aplicar(await lerPixLote());
  }
  useEffect(() => {
    let vivo = true;
    lerPixLote()
      .then((r) => { if (vivo) aplicar(r); })
      .catch(() => { if (vivo) { setErro("Não deu pra abrir. Confira a internet e tente de novo."); setCarregando(false); } });
    return () => { vivo = false; };
  }, []);

  const escolhidos = useMemo(() => candidatos.filter((c) => marcados.has(c.id) && pode(c) && c.valor > 0.005), [candidatos, marcados]);
  const total = escolhidos.reduce((s, c) => s + c.valor, 0);
  const semChave = candidatos.filter((c) => !pode(c) && c.valor > 0.005);
  const jaTemArquivoHoje = ultimos.some((u) => u.data_pagamento === data);

  function salvarConfig() {
    setErro(null);
    start(async () => {
      const r = await salvarPixLoteConfig(form);
      if (!r.ok) { setErro(r.erro); return; }
      await recarregar();
    });
  }

  function gerar() {
    setErro(null);
    setFeito(null);
    start(async () => {
      const r = await gerarArquivoPix({ segunda, dataPagamento: data, itens: escolhidos.map((c) => ({ colaboradorId: c.id, valor: Math.round(c.valor * 100) / 100 })) });
      if (!r.ok) { setErro(r.erro); return; }
      const blob = new Blob([r.conteudo], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nome;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setFeito({ nome: r.nome, qtd: r.qtd, total: r.total, fora: r.fora });
      await recarregar();
    });
  }

  return (
    <Janela onFechar={onFechar} rotulo="Arquivo Pix" fundoFecha>
      <div className="cartao mx-auto my-8 w-full max-w-3xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-numero text-xl font-bold text-texto">Pagar por Pix em lote</h2>
            <p className="mt-1 text-sm text-texto-suave">
              O sistema monta o arquivo; você importa no Internet Banking do <b className="text-texto">Sicoob</b>, confere e aprova lá. Daqui não sai dinheiro.
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-controle text-texto-suave hover:bg-superficie-suave">✕</button>
        </div>

        {carregando ? (
          <p className="mt-6 text-sm text-texto-fraco">Abrindo…</p>
        ) : editando ? (
          <div className="mt-5">
            <p className="rotulo">Dados da conta da empresa no Sicoob</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {CAMPOS.map((c) => (
                <label key={c.k} className={`block text-sm ${c.largura ?? ""}`}>
                  <span className="text-texto-suave">{c.rotulo}</span>
                  <input
                    value={form[c.k] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [c.k]: e.target.value }))}
                    inputMode={c.k === "convenio" || c.k === "nome_empresa" || c.k === "agencia_dv" ? undefined : "numeric"}
                    className="campo mt-1 w-full"
                  />
                  {c.dica && <span className="mt-0.5 block text-mini text-texto-fraco">{c.dica}</span>}
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={salvarConfig} disabled={pending} className="btn-principal text-sm">{pending ? "Salvando…" : "Salvar dados do banco"}</button>
              {pronta && <button type="button" onClick={() => setEditando(false)} className="btn-secundario text-sm">Voltar</button>}
            </div>
          </div>
        ) : !pronta ? (
          <p className="mt-6 rounded-controle bg-destaque p-4 text-sm text-texto">
            Os dados do banco ainda não foram preenchidos. Peça ao dono pra abrir esta janela e preencher o convênio do Sicoob.
          </p>
        ) : (
          <div className="mt-5">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                <span className="text-texto-suave">Data do pagamento</span>
                <input type="date" value={data} min={hojeLocal()} onChange={(e) => setData(e.target.value)} className="campo mt-1 block" />
              </label>
              <div className="ml-auto text-right">
                <p className="rotulo">Total no arquivo</p>
                <p className="font-numero text-2xl font-bold text-texto">{brl(total)}</p>
                <p className="text-mini text-texto-fraco">{escolhidos.length} pessoa(s)</p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-controle border border-borda">
              <table className="w-full text-sm">
                <thead className="bg-superficie-suave">
                  <tr>
                    <th className="w-12 px-3 py-2"><span className="sr-only">Entra</span></th>
                    <th className="rotulo px-2 py-2 text-left">Pessoa</th>
                    <th className="rotulo px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {candidatos.filter((c) => c.valor > 0.005).map((c) => (
                    <tr key={c.id} className="border-t border-borda">
                      <td className="px-3 py-1.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Incluir ${c.nome}`}
                          disabled={!pode(c)}
                          checked={pode(c) && marcados.has(c.id)}
                          onChange={(e) => setMarcados((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })}
                          className="h-5 w-5"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className={pode(c) ? "text-texto" : "text-texto-fraco"}>{c.nome}</div>
                        <div className="text-mini text-texto-fraco">
                          {!c.temChave ? "sem chave Pix no cadastro" : !c.temCpf ? "sem CPF no cadastro (o banco exige)" : `Pix ${c.tipoChave ?? ""}`}
                          {c.jaLancado ? " · já lançado no contas a pagar" : ""}
                          {c.emDinheiro ? " · marcado pra sair do cofre" : ""}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right font-numero">{brl(c.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {semChave.length > 0 && (
              <p className="mt-2 text-mini text-aviso-texto">
                {semChave.length} pessoa(s) sem chave Pix ou sem CPF ficam de fora. Os dois entram no cadastro rápido de Colaboradores.
              </p>
            )}
            {jaTemArquivoHoje && (
              <p className="mt-2 text-mini text-aviso-texto">Já existe um arquivo pra essa data. Confira pra não pagar duas vezes.</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={gerar} disabled={pending || !escolhidos.length} className="btn-principal text-sm disabled:opacity-50">
                <Icone nome="baixar" tamanho={16} className="mr-1.5" /> {pending ? "Montando…" : "Gerar arquivo"}
              </button>
              {podeEditar && (
                <button type="button" onClick={() => setEditando(true)} className="btn-secundario text-sm">Dados do banco</button>
              )}
              <span className="text-mini text-texto-fraco">Convênio {config?.convenio} · ag. {config?.agencia} · conta {config?.conta}-{config?.conta_dv}</span>
            </div>

            {feito && (
              <div className="mt-4 rounded-controle bg-destaque p-4 text-sm text-texto">
                <p className="font-semibold">Arquivo {feito.nome} baixado: {feito.qtd} Pix, {brl(feito.total)}.</p>
                <p className="mt-1">Agora, no Internet Banking do Sicoob: importação de arquivos CNAB 240 → escolha este arquivo → confira a lista → aprove.</p>
                {feito.fora.length > 0 && <p className="mt-1 text-aviso-texto">Ficaram de fora: {feito.fora.join("; ")}.</p>}
              </div>
            )}

            {ultimos.length > 0 && (
              <div className="mt-5">
                <p className="rotulo">Últimos arquivos</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {ultimos.map((u) => (
                    <li key={u.nsa} className="flex flex-wrap justify-between gap-2 text-texto-suave">
                      <span>{u.nome_arquivo}</span>
                      <span className="font-numero">{u.qtd} Pix · {brl(Number(u.total))} · pagar em {u.data_pagamento.split("-").reverse().join("/")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {erro && <p role="alert" className="mt-3 text-sm text-urgente-texto">{erro}</p>}
      </div>
    </Janela>
  );
}
