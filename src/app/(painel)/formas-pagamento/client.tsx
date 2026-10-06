"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao, Enviar } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { confirmar } from "@/components/dialogo";
import { CANAIS, TIPOS_FORMA, iconeDoTipo, type FormaPagamento, type TipoFormaCadastro } from "@/lib/formas-pagamento";
import { alternarForma, excluirForma, moverForma, salvarForma, type DadosForma } from "./actions";

const VAZIA: DadosForma = {
  nome: "",
  tipo: "outro",
  nome_app: "",
  no_caixa: true,
  no_pdv: false,
  no_delivery: false,
  no_app: false,
  no_fiado: false,
};

const rotuloTipo = (t: TipoFormaCadastro) => TIPOS_FORMA.find((x) => x.id === t)?.label ?? t;

export function FormasClient({ formas }: { formas: FormaPagamento[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<DadosForma | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function rodar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    const r = await acao();
    if (!r.ok) setErro(r.erro ?? "Não deu certo.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {erro && (
        <p className="rounded-controle bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">{erro}</p>
      )}

      {/* Lista */}
      <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-xs font-medium text-texto-fraco">
            <tr>
              <th className="px-4 py-3">Forma</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Aparece em</th>
              <th className="px-4 py-3">Ativa</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {formas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-texto-suave">
                  Nenhuma forma cadastrada. Enquanto isso as telas usam a lista padrão (Dinheiro, Pix, cartões).
                </td>
              </tr>
            )}
            {formas.map((f, i) => (
              <tr key={f.id} className={f.ativo ? "" : "opacity-60"}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium text-texto">
                    <Icone nome={iconeDoTipo(f.tipo)} tamanho={16} className="text-texto-suave" />
                    {f.nome}
                  </div>
                  {f.nome_app && <div className="text-mini text-texto-fraco">no app: {f.nome_app}</div>}
                </td>
                <td className="px-4 py-3 text-texto-suave">{rotuloTipo(f.tipo)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {CANAIS.map((c) => {
                      const ligado = f[c.campo];
                      return (
                        <BotaoAcao
                          key={c.campo}
                          aoClicar={() => rodar(() => alternarForma(f.id, c.campo, !ligado))}
                          title={ligado ? `Tirar de ${c.label}` : `Mostrar em ${c.label}`}
                          className={`rounded-controle border px-2 py-0.5 text-xs font-medium ${
                            ligado
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "border-borda text-texto-fraco hover:border-borda-forte"
                          }`}
                        >
                          {c.label}
                        </BotaoAcao>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <BotaoAcao
                    aoClicar={() => rodar(() => alternarForma(f.id, "ativo", !f.ativo))}
                    className={`rounded-controle border px-2 py-0.5 text-xs font-medium ${
                      f.ativo
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "border-borda text-texto-fraco"
                    }`}
                  >
                    {f.ativo ? "sim" : "não"}
                  </BotaoAcao>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <BotaoAcao aoClicar={() => rodar(() => moverForma(f.id, -1))} disabled={i === 0} title="Subir" className="rounded-controle p-1.5 text-texto-fraco hover:text-texto disabled:opacity-30">
                      <Icone nome="subir" tamanho={14} />
                    </BotaoAcao>
                    <BotaoAcao aoClicar={() => rodar(() => moverForma(f.id, 1))} disabled={i === formas.length - 1} title="Descer" className="rounded-controle p-1.5 text-texto-fraco hover:text-texto disabled:opacity-30">
                      <Icone nome="descendo" tamanho={14} />
                    </BotaoAcao>
                    <button
                      type="button"
                      onClick={() => { setErro(null); setEditando({ id: f.id, nome: f.nome, tipo: f.tipo, nome_app: f.nome_app ?? "", no_caixa: f.no_caixa, no_pdv: f.no_pdv, no_delivery: f.no_delivery, no_app: f.no_app, no_fiado: f.no_fiado }); }}
                      className="rounded-controle px-2 py-1 text-xs font-medium text-texto-suave hover:text-orange-600"
                    >
                      Editar
                    </button>
                    <BotaoAcao
                      aoClicar={async () => {
                        const ok = await confirmar(`Apagar "${f.nome}"?`, { detalhe: "As vendas antigas continuam com esse nome. Se for só parar de usar, prefira desativar.", perigo: true, okTexto: "Apagar" });
                        if (ok) await rodar(() => excluirForma(f.id));
                      }}
                      title="Apagar"
                      className="rounded-controle p-1.5 text-texto-fraco hover:text-erro"
                    >
                      <Icone nome="lixeira" tamanho={14} />
                    </BotaoAcao>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-mini text-texto-fraco">
        Ficam fixas, porque são fluxos próprios: <b>Saldo cliente</b> e <b>Compra da equipe</b> no caixa, e <b>Pix agora</b> (QR) no app quando o Pix online está ligado.
      </p>

      {/* Formulário */}
      {editando ? (
        <Formulario
          inicial={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={async (d) => {
            const r = await salvarForma(d);
            if (!r.ok) return r.erro ?? "Não salvou.";
            setEditando(null);
            router.refresh();
            return null;
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setErro(null); setEditando({ ...VAZIA }); }}
          className="rounded-controle bg-primaria px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Nova forma
        </button>
      )}
    </div>
  );
}

function Formulario({
  inicial,
  aoFechar,
  aoSalvar,
}: {
  inicial: DadosForma;
  aoFechar: () => void;
  aoSalvar: (d: DadosForma) => Promise<string | null>;
}) {
  const [d, setD] = useState<DadosForma>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const explica = TIPOS_FORMA.find((t) => t.id === d.tipo)?.explica;
  const inputCls = "min-h-11 w-full rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";

  return (
    <form
      action={async () => {
        setErro(null);
        const r = await aoSalvar(d);
        if (r) setErro(r);
      }}
      className="rounded-cartao bg-painel-cartao p-4 sm:p-5"
    >
      <h2 className="mb-3 text-base font-semibold text-texto">{d.id ? `Editar "${inicial.nome}"` : "Nova forma de pagamento"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-texto-suave" htmlFor="forma-nome">Nome</label>
          <input id="forma-nome" value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} placeholder="Ex.: Vale alimentação" className={inputCls} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-suave" htmlFor="forma-tipo">Tipo (decide o comportamento)</label>
          <select id="forma-tipo" value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as TipoFormaCadastro })} className={inputCls}>
            {TIPOS_FORMA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          {explica && <p className="mt-1 text-mini text-texto-fraco">{explica}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-suave" htmlFor="forma-app">Nome no app do cliente (opcional)</label>
          <input id="forma-app" value={d.nome_app ?? ""} onChange={(e) => setD({ ...d, nome_app: e.target.value })} placeholder='Ex.: "Cartão na entrega"' className={inputCls} />
        </div>
        <div>
          <span className="mb-1 block text-xs text-texto-suave">Aparece em</span>
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
            {CANAIS.map((c) => (
              <label key={c.campo} className="flex items-center gap-2 text-sm text-texto">
                <input type="checkbox" checked={d[c.campo]} onChange={(e) => setD({ ...d, [c.campo]: e.target.checked })} className="h-4 w-4" />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      {erro && <p className="mt-3 text-sm text-erro">{erro}</p>}
      <div className="mt-4 flex items-center gap-2">
        <Enviar className="rounded-controle bg-primaria px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          {d.id ? "Salvar" : "Criar forma"}
        </Enviar>
        <button type="button" onClick={aoFechar} className="rounded-controle px-3 py-2 text-sm text-texto-suave hover:text-texto">
          Cancelar
        </button>
      </div>
    </form>
  );
}
