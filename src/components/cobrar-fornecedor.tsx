"use client";

// Botão "Cobrar o fornecedor": abre a janela com o que faltou / veio diferente,
// a pessoa marca o que mandar, confere o texto e abre no WhatsApp Web já no
// número do fornecedor. Usado no pedido (/conferencia/[id]) e no relatório de
// divergências filtrado por fornecedor.
import { useMemo, useState } from "react";
import { Janela } from "@/components/janela";
import { Icone } from "@/components/icone";
import {
  FECHO_PADRAO,
  ORDEM_GRUPOS,
  linhasDeCobranca,
  linkWhatsWeb,
  textoDaCobranca,
  type PedidoCobranca,
} from "@/lib/conferencia-cobranca";

const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function CobrarFornecedor({
  empresa,
  fornecedor,
  whatsapp,
  pedidos,
  unidades,
  classe = "btn-principal text-sm",
}: {
  empresa: string;
  fornecedor: string;
  whatsapp: string | null;
  pedidos: PedidoCobranca[];
  unidades: Record<string, string>; // produto_id → unidade
  classe?: string;
}) {
  const linhas = useMemo(() => linhasDeCobranca(pedidos, (id) => (id ? unidades[id] ?? "" : "")), [pedidos, unidades]);
  const [aberto, setAberto] = useState(false);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(() => new Set(linhas.filter((l) => l.marcada).map((l) => l.chave)));
  const [fecho, setFecho] = useState(FECHO_PADRAO);
  const [editado, setEditado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const gerado = useMemo(
    () => textoDaCobranca({ empresa, fornecedor, pedidos, linhas, escolhidas, fecho }),
    [empresa, fornecedor, pedidos, linhas, escolhidas, fecho],
  );
  const texto = editado ?? gerado;
  const total = linhas.filter((l) => escolhidas.has(l.chave)).reduce((s, l) => s + (l.valor ?? 0), 0);
  const nada = escolhidas.size === 0;
  const temNumero = String(whatsapp ?? "").replace(/\D/g, "").length >= 10;
  const variosPedidos = new Set(linhas.map((l) => l.pedidoId)).size > 1;

  if (linhas.length === 0) return null;

  function alternar(chave: string) {
    setEditado(null); // mudou a escolha: o texto volta a ser o montado
    setEscolhidas((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={classe}>
        <span className="inline-flex items-center gap-1.5"><Icone nome="zap" tamanho={16} /> Cobrar o fornecedor</span>
      </button>
      {aberto && (
        <Janela onFechar={() => setAberto(false)} fundoFecha>
          <div className="cartao my-8 w-full max-w-3xl p-5" role="dialog" aria-label={`Cobrar ${fornecedor}`} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-numero text-lg font-bold text-texto">Cobrar {fornecedor}</h2>
                <p className="text-sm text-texto-suave">Marque o que mandar. O texto ao lado é o que vai no WhatsApp.</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="flex h-11 w-11 shrink-0 items-center justify-center text-texto-fraco"><Icone nome="fechar" tamanho={18} /></button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                {ORDEM_GRUPOS.map((g) => {
                  const doGrupo = linhas.filter((l) => l.grupo === g);
                  if (!doGrupo.length) return null;
                  return (
                    <fieldset key={g}>
                      <legend className="rotulo mb-1">{g}</legend>
                      <ul className="space-y-1">
                        {doGrupo.map((l) => (
                          <li key={l.chave}>
                            <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-controle px-2 py-1.5 text-sm hover:bg-superficie-suave">
                              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-orange-600" checked={escolhidas.has(l.chave)} onChange={() => alternar(l.chave)} />
                              <span className="text-texto">
                                {l.texto}
                                {variosPedidos && <span className="ml-1 text-texto-fraco">· pedido {dm(pedidos.find((p) => p.id === l.pedidoId)?.data ?? "")}</span>}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </fieldset>
                  );
                })}
                <label className="block text-sm">
                  <span className="rotulo">Fim da mensagem</span>
                  <textarea value={fecho} onChange={(e) => { setEditado(null); setFecho(e.target.value); }} rows={2} className="campo mt-1 w-full" />
                </label>
              </div>

              <div className="flex flex-col">
                <label className="flex flex-1 flex-col text-sm">
                  <span className="rotulo">Mensagem (dá pra mexer antes de mandar)</span>
                  <textarea value={texto} onChange={(e) => setEditado(e.target.value)} rows={14} className="campo mt-1 w-full flex-1 font-mono text-xs" />
                </label>
                {editado != null && (
                  <button type="button" onClick={() => setEditado(null)} className="mt-1 self-start text-xs font-semibold text-texto-marca underline">Voltar ao texto montado</button>
                )}
                {total > 0 && <p className="mt-2 text-sm text-texto-suave">Total marcado: <b className="font-numero text-texto">{moeda(total)}</b></p>}
                {!temNumero && <p className="mt-2 text-xs text-aviso-texto">Este fornecedor não tem WhatsApp no cadastro: o WhatsApp Web abre pra você escolher o contato.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={nada}
                    onClick={() => navigator.clipboard.writeText(texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); })}
                    className="btn-secundario !min-h-11 flex-1 text-sm disabled:opacity-50"
                  >
                    {copiado ? "Copiado ✓" : "Copiar texto"}
                  </button>
                  {nada ? (
                    <span className="btn-principal !min-h-11 flex-1 cursor-not-allowed text-sm opacity-50" aria-disabled="true">Abrir no WhatsApp</span>
                  ) : (
                    <a href={linkWhatsWeb(whatsapp, texto)} target="_blank" rel="noopener noreferrer" className="btn-principal !min-h-11 flex-1 text-sm">
                      Abrir no WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Janela>
      )}
    </>
  );
}
