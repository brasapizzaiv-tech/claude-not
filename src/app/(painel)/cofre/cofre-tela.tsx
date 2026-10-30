"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icone, type NomeIcone } from "@/components/icone";
import { BotaoAcao } from "@/components/enviar";
import { confirmar, avisar } from "@/components/dialogo";
import { moedaBR } from "@/lib/format";
import {
  DENOMINACOES, GAVETAS, TIPOS, descreverQuantidades, ehMoeda, gavetaDe, listaEncomenda, rotuloDen, situacao, valorDe, valorGaveta,
  type Faixa, type Quantidades,
} from "@/lib/cofre";
import {
  buscarContasAbertas, cancelarEncomenda, conferirCofre, desfazerMovimento, marcarEncomenda, pagarConta, registrarMovimento, salvarFaixas,
} from "./actions";

export type Pendente = {
  origem: { tipo: "caixa" | "sangria" | "abertura"; id: string; esperado: number };
  tipo: "entrada_caixa" | "sangria" | "fundo_caixa";
  quando: string;
  rotulo: string;
  valor: number;
  sai: boolean;
};

export type DadosCofre = {
  iniciado: boolean;
  saldo: Quantidades;
  faixas: Record<string, Faixa>;
  pendentes: Pendente[];
  pedidos: { id: string; quantidades: Quantidades; valor: number; obs: string | null; criado_por_nome: string | null; quando: string }[];
  movimentos: { id: string; tipo: string; quantidades: Quantidades; valor: number; esperado: number | null; descricao: string | null; criado_por_nome: string | null; quando: string }[];
  categorias: { id: string; nome: string }[];
};

// O que a janela de contagem está fazendo agora.
type Janela =
  | { modo: "mov"; tipo: string; titulo: string; sai: boolean; esperado?: number; origem?: Pendente["origem"]; pedidoId?: string; inicial?: Quantidades }
  | { modo: "pagar" }
  | { modo: "troca" }
  | { modo: "conferir" };

const TITULO = "font-numero font-bold tracking-apertada text-texto";

export function CofreTela({ d }: { d: DadosCofre }) {
  const router = useRouter();
  const [aba, setAba] = useState<"cofre" | "historico" | "faixas">("cofre");
  const [janela, setJanela] = useState<Janela | null>(null);
  const total = valorDe(d.saldo);
  const encomenda = useMemo(() => listaEncomenda(d.saldo, d.faixas), [d.saldo, d.faixas]);
  const feito = () => { setJanela(null); router.refresh(); };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="rotulo">Cofre</span>
          <h1 className={`text-[30px] leading-[1.1] ${TITULO}`}>{moedaBR(total)}</h1>
        </div>
        <button type="button" onClick={() => setJanela({ modo: "conferir" })} className="btn-secundario text-sm">
          <Icone nome="conferido" tamanho={16} /> {d.iniciado ? "Conferir cofre" : "Fazer a primeira contagem"}
        </button>
      </div>

      {!d.iniciado && (
        <div className="cartao-foco p-5">
          <span className="rotulo text-painel-foco-rotulo">Primeiro passo</span>
          <p className="mt-1 text-lg font-semibold">Conte tudo o que tem hoje no cofre, nota por nota e moeda por moeda.</p>
          <p className="mt-1 text-sm opacity-80">Essa contagem vira o saldo inicial. A partir dela, cada entrada e saída fica registrada, e os caixas fechados e as sangrias aparecem aqui pra guardar.</p>
          <button type="button" onClick={() => setJanela({ modo: "conferir" })} className="btn-principal mt-3 text-sm">Começar a contagem</button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {GAVETAS.map((g, i) => (
          <div key={g.chave} className={`rounded-cartao p-4 ${i === 1 ? "bg-destaque" : "bg-painel-cartao"}`}>
            <span className="rotulo">{g.rotulo}</span>
            <p className={`mt-1 text-[24px] ${TITULO}`}>{moedaBR(valorGaveta(d.saldo, g.chave))}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {([["cofre", "Cofre"], ["historico", "Movimentações"], ["faixas", "Mínimo e máximo"]] as const).map(([k, r]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ${aba === k ? "bg-painel-foco-fundo text-painel-foco-texto" : "btn-secundario"}`}>
            {r}
          </button>
        ))}
      </div>

      {aba === "cofre" && (
        <div className="space-y-5">
          {d.iniciado && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Acao icone="documento" rotulo="Pagar uma conta" onClick={() => setJanela({ modo: "pagar" })} />
              <Acao icone="entrega" rotulo="Troco pro motoboy" onClick={() => setJanela({ modo: "mov", tipo: "troco_motoboy", titulo: "Troco pro motoboy", sai: true })} />
              <Acao icone="banco" rotulo="Depósito no banco" onClick={() => setJanela({ modo: "mov", tipo: "deposito", titulo: "Depósito no banco", sai: true })} />
              <Acao icone="caminhao" rotulo="Chegou troco" onClick={() => setJanela({ modo: "mov", tipo: "chegou_troco", titulo: "Chegou troco", sai: false })} />
              <Acao icone="dividir" rotulo="Trocar notas" onClick={() => setJanela({ modo: "troca" })} />
            </div>
          )}

          {d.pendentes.length > 0 && (
            <div className="cartao p-4">
              <span className="rotulo">Esperando entrar ou sair do cofre</span>
              <ul className="mt-2 divide-y divide-borda">
                {d.pendentes.map((p) => (
                  <li key={`${p.origem.tipo}:${p.origem.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="text-sm">
                      {p.rotulo}
                      <span className="block text-xs text-texto-fraco">{p.sai ? "sai do cofre" : "entra no cofre"}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-numero font-bold">{moedaBR(p.valor)}</span>
                      <button type="button" className="btn-secundario text-sm"
                        onClick={() => setJanela({ modo: "mov", tipo: p.tipo, titulo: p.rotulo, sai: p.sai, esperado: p.valor, origem: p.origem })}>
                        {p.sai ? "Contar e tirar" : "Contar e guardar"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(Object.keys(encomenda).length > 0 || d.pedidos.length > 0) && (
            <div className="cartao space-y-3 p-4">
              {Object.keys(encomenda).length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <span className="pilula pilula-urgente mr-2">encomendar troco</span>
                    {descreverQuantidades(encomenda)} <span className="font-numero font-bold">({moedaBR(valorDe(encomenda))})</span>
                  </span>
                  <BotaoAcao className="btn-secundario text-sm" aoClicar={async () => {
                    const r = await marcarEncomenda({ quantidades: encomenda });
                    if (!r.ok) return avisar(r.mensagem);
                    router.refresh();
                  }}>Marcar como encomendado</BotaoAcao>
                </div>
              )}
              {d.pedidos.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-controle bg-superficie-suave px-3 py-2">
                  <span className="text-sm">
                    <span className="pilula pilula-info mr-2">encomendado</span>
                    {descreverQuantidades(p.quantidades)} · {p.quando}{p.criado_por_nome ? ` · ${p.criado_por_nome}` : ""}
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className="btn-secundario text-sm"
                      onClick={() => setJanela({ modo: "mov", tipo: "chegou_troco", titulo: "Chegou o troco encomendado", sai: false, pedidoId: p.id, inicial: p.quantidades, esperado: Number(p.valor) })}>
                      Chegou
                    </button>
                    <BotaoAcao className="btn-secundario text-sm" aoClicar={async () => {
                      if (!(await confirmar("Cancelar essa encomenda?"))) return;
                      await cancelarEncomenda(p.id); router.refresh();
                    }}>Cancelar</BotaoAcao>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="cartao overflow-x-auto p-4">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left">
                  <th className="rotulo pb-2 font-normal">Nota / moeda</th>
                  <th className="rotulo pb-2 text-right font-normal">Qtd</th>
                  <th className="rotulo pb-2 text-right font-normal">Valor</th>
                  <th className="rotulo pb-2 text-right font-normal">Mín.</th>
                  <th className="rotulo pb-2 text-right font-normal">Máx.</th>
                  <th className="rotulo pb-2 pl-4 font-normal">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {DENOMINACOES.map((c) => {
                  const q = d.saldo[String(c)] ?? 0;
                  const f = d.faixas[String(c)];
                  const s = situacao(q, f);
                  return (
                    <tr key={c}>
                      <td className="py-2">{rotuloDen(c)} <span className="text-xs text-texto-fraco">{ehMoeda(c) ? "moeda" : "nota"}</span></td>
                      <td className="py-2 text-right font-numero">{q}</td>
                      <td className="py-2 text-right font-numero">{moedaBR((q * c) / 100)}</td>
                      <td className="py-2 text-right font-numero text-texto-suave">{f?.minimo || "—"}</td>
                      <td className="py-2 text-right font-numero text-texto-suave">{f?.maximo || "—"}</td>
                      <td className="py-2 pl-4">
                        {s.tipo === "encomendar" && <span className="pilula pilula-urgente">encomendar {s.n}</span>}
                        {s.tipo === "depositar" && <span className="pilula pilula-info">acima do máx.: depositar {s.n}</span>}
                        {s.tipo === "ok" && <span className="pilula pilula-ok">ok</span>}
                        {s.tipo === "livre" && <span className="text-xs text-texto-fraco">sem mín./máx.</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aba === "historico" && <Historico d={d} />}
      {aba === "faixas" && <Faixas d={d} />}

      {janela && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="cartao my-6 w-full max-w-2xl p-5">
            {janela.modo === "mov" && <FormMovimento j={janela} saldo={d.saldo} onFechar={() => setJanela(null)} onFeito={feito} />}
            {janela.modo === "pagar" && <FormPagar d={d} onFechar={() => setJanela(null)} onFeito={feito} />}
            {janela.modo === "troca" && <FormTroca saldo={d.saldo} onFechar={() => setJanela(null)} onFeito={feito} />}
            {janela.modo === "conferir" && <FormConferir d={d} onFechar={() => setJanela(null)} onFeito={feito} />}
          </div>
        </div>
      )}
    </div>
  );
}

function Acao({ icone, rotulo, onClick }: { icone: NomeIcone; rotulo: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-secundario flex min-h-14 flex-col items-center justify-center gap-1 text-sm">
      <Icone nome={icone} tamanho={18} /> {rotulo}
    </button>
  );
}

/** Uma caixinha de quantidade por nota/moeda, agrupadas por gaveta. */
function Contagem({ valor, onChange, saldo, mostrarSaldo }: { valor: Quantidades; onChange: (q: Quantidades) => void; saldo?: Quantidades; mostrarSaldo?: boolean }) {
  return (
    <div className="space-y-3">
      {GAVETAS.map((g) => (
        <div key={g.chave}>
          <span className="rotulo">{g.rotulo}</span>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[...g.centavos].reverse().map((c) => (
              <label key={c} className="flex items-center justify-between gap-2 rounded-controle bg-superficie-suave px-3 py-1.5 text-sm">
                <span>
                  {rotuloDen(c)}
                  {mostrarSaldo && <span className="block text-xs text-texto-fraco">tem {saldo?.[String(c)] ?? 0}</span>}
                </span>
                <input
                  inputMode="numeric"
                  aria-label={`Quantidade de ${rotuloDen(c)}`}
                  value={valor[String(c)] ? String(valor[String(c)]) : ""}
                  onChange={(e) => {
                    const n = Math.max(0, Math.trunc(Number(e.target.value.replace(/\D/g, "")) || 0));
                    const novo = { ...valor };
                    if (n) novo[String(c)] = n; else delete novo[String(c)];
                    onChange(novo);
                  }}
                  className="min-h-11 w-20 rounded-controle border border-borda bg-painel-cartao px-2 text-right font-numero"
                  placeholder="0"
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Cabecalho({ titulo, onFechar }: { titulo: string; onFechar: () => void }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <h2 className={`text-xl ${TITULO}`}>{titulo}</h2>
      <button type="button" onClick={onFechar} aria-label="Fechar" className="btn-secundario min-h-11 min-w-11 justify-center"><Icone nome="fechar" tamanho={16} /></button>
    </div>
  );
}

function Diferenca({ total, esperado }: { total: number; esperado?: number }) {
  if (esperado == null) return null;
  const dif = Math.round((total - esperado) * 100) / 100;
  if (Math.abs(dif) < 0.005) return <span className="pilula pilula-ok">bateu com o esperado</span>;
  return <span className="pilula pilula-urgente">{dif > 0 ? "sobrou" : "faltou"} {moedaBR(Math.abs(dif))}</span>;
}

function FormMovimento({ j, saldo, onFechar, onFeito }: { j: Extract<Janela, { modo: "mov" }>; saldo: Quantidades; onFechar: () => void; onFeito: () => void }) {
  const [q, setQ] = useState<Quantidades>(j.inicial ?? {});
  const [desc, setDesc] = useState("");
  const total = valorDe(q);
  return (
    <div>
      <Cabecalho titulo={j.titulo} onFechar={onFechar} />
      <p className="mb-3 text-sm text-texto-suave">
        {j.sai ? "Conte as notas e moedas que SAEM do cofre." : "Conte as notas e moedas que ENTRAM no cofre."}
        {j.esperado != null && <> O sistema esperava <b className="font-numero">{moedaBR(j.esperado)}</b>.</>}
      </p>
      <Contagem valor={q} onChange={setQ} saldo={saldo} mostrarSaldo={j.sai} />
      {!j.origem && (
        <label className="mt-3 block text-sm">Observação
          <input value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1 min-h-11 w-full rounded-controle border border-borda bg-painel-cartao px-3" placeholder={j.tipo === "troco_motoboy" ? "Igor, noite" : ""} />
        </label>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2"><span className={`text-xl ${TITULO}`}>{moedaBR(total)}</span><Diferenca total={total} esperado={j.esperado} /></span>
        <BotaoAcao className="btn-principal text-sm" aoClicar={async () => {
          if (j.esperado != null && Math.abs(total - j.esperado) >= 0.005 && !(await confirmar(`A contagem deu ${moedaBR(total)} e o esperado era ${moedaBR(j.esperado)}. Registrar assim mesmo?`))) return;
          const r = await registrarMovimento({ tipo: j.tipo, quantidades: q, descricao: desc, origem: j.origem ?? null, pedidoId: j.pedidoId ?? null });
          if (!r.ok) return avisar(r.mensagem);
          onFeito();
        }}>{j.sai ? "Registrar saída" : "Guardar no cofre"}</BotaoAcao>
      </div>
    </div>
  );
}

function FormPagar({ d, onFechar, onFeito }: { d: DadosCofre; onFechar: () => void; onFeito: () => void }) {
  const [q, setQ] = useState<Quantidades>({});
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("");
  const [busca, setBusca] = useState("");
  const [contas, setContas] = useState<{ id: string; descricao: string; valor: number; vencimento: string | null }[] | null>(null);
  const [conta, setConta] = useState<{ id: string; descricao: string; valor: number } | null>(null);
  const total = valorDe(q);
  return (
    <div>
      <Cabecalho titulo="Pagar uma conta com dinheiro do cofre" onFechar={onFechar} />
      <div className="space-y-3">
        <div className="rounded-controle bg-superficie-suave p-3">
          <span className="rotulo">Essa conta já está no Contas a Pagar?</span>
          {conta ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{conta.descricao} · <b className="font-numero">{moedaBR(conta.valor)}</b> <span className="pilula pilula-ok ml-1">vai dar baixa</span></span>
              <button type="button" className="btn-secundario text-sm" onClick={() => setConta(null)}>Trocar</button>
            </div>
          ) : (
            <>
              <div className="mt-2 flex gap-2">
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="água, luz, 100,00…" aria-label="Buscar conta em aberto"
                  className="min-h-11 flex-1 rounded-controle border border-borda bg-painel-cartao px-3 text-sm" />
                <BotaoAcao className="btn-secundario text-sm" aoClicar={async () => setContas(await buscarContasAbertas(busca))}><Icone nome="buscar" tamanho={15} /> Buscar</BotaoAcao>
              </div>
              {contas && (contas.length === 0
                ? <p className="mt-2 text-xs text-texto-fraco">Nenhuma conta em aberto com isso. Se não está lá, preencha abaixo que o sistema cria a conta já paga.</p>
                : (
                  <ul className="mt-2 space-y-1">
                    {contas.map((c) => (
                      <li key={c.id}>
                        <button type="button" className="flex min-h-11 w-full items-center justify-between rounded-controle px-2 text-left text-sm hover:bg-destaque"
                          onClick={() => { setConta({ id: c.id, descricao: c.descricao, valor: Number(c.valor) }); setDesc(c.descricao); }}>
                          <span>{c.descricao}{c.vencimento && <span className="text-xs text-texto-fraco"> · vence {c.vencimento.split("-").reverse().join("/")}</span>}</span>
                          <span className="font-numero font-bold">{moedaBR(Number(c.valor))}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </>
          )}
        </div>
        {!conta && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">O que foi pago
              <input value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1 min-h-11 w-full rounded-controle border border-borda bg-painel-cartao px-3" placeholder="Conta de água" />
            </label>
            <label className="text-sm">Categoria (financeiro)
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="mt-1 min-h-11 w-full rounded-controle border border-borda bg-painel-cartao px-3">
                <option value="">Escolha…</option>
                {d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          </div>
        )}
        <span className="rotulo block">Notas e moedas que saíram do cofre</span>
        <Contagem valor={q} onChange={setQ} saldo={d.saldo} mostrarSaldo />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2"><span className={`text-xl ${TITULO}`}>{moedaBR(total)}</span>{conta && <Diferenca total={total} esperado={conta.valor} />}</span>
        <BotaoAcao className="btn-principal text-sm" aoClicar={async () => {
          const r = await pagarConta({ quantidades: q, descricao: desc, categoriaId: cat || null, lancamentoId: conta?.id ?? null });
          if (!r.ok) return avisar(r.mensagem);
          onFeito();
        }}>{conta ? "Pagar e dar baixa" : "Pagar e lançar no financeiro"}</BotaoAcao>
      </div>
    </div>
  );
}

function FormTroca({ saldo, onFechar, onFeito }: { saldo: Quantidades; onFechar: () => void; onFeito: () => void }) {
  const [sai, setSai] = useState<Quantidades>({});
  const [entra, setEntra] = useState<Quantidades>({});
  const [desc, setDesc] = useState("");
  const vs = valorDe(sai), ve = valorDe(entra);
  return (
    <div>
      <Cabecalho titulo="Trocar notas" onFechar={onFechar} />
      <p className="mb-3 text-sm text-texto-suave">Ex.: tirar 1 nota de R$ 100 e colocar 10 de R$ 10. O que sai e o que entra têm que dar o mesmo valor.</p>
      <span className="rotulo">Sai do cofre · {moedaBR(vs)}</span>
      <div className="mt-1"><Contagem valor={sai} onChange={setSai} saldo={saldo} mostrarSaldo /></div>
      <span className="rotulo mt-4 block">Entra no cofre · {moedaBR(ve)}</span>
      <div className="mt-1"><Contagem valor={entra} onChange={setEntra} /></div>
      <label className="mt-3 block text-sm">Observação
        <input value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1 min-h-11 w-full rounded-controle border border-borda bg-painel-cartao px-3" placeholder="Troca no banco" />
      </label>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {Math.abs(vs - ve) < 0.005 ? <span className="pilula pilula-ok">valores iguais</span> : <span className="pilula pilula-urgente">diferença de {moedaBR(Math.abs(vs - ve))}</span>}
        <BotaoAcao className="btn-principal text-sm" aoClicar={async () => {
          const q: Quantidades = { ...entra };
          for (const [k, v] of Object.entries(sai)) q[k] = (q[k] ?? 0) - v;
          const r = await registrarMovimento({ tipo: "troca", quantidades: q, descricao: desc });
          if (!r.ok) return avisar(r.mensagem);
          onFeito();
        }}>Registrar troca</BotaoAcao>
      </div>
    </div>
  );
}

function FormConferir({ d, onFechar, onFeito }: { d: DadosCofre; onFechar: () => void; onFeito: () => void }) {
  const [q, setQ] = useState<Quantidades>({});
  const [motivo, setMotivo] = useState("");
  const total = valorDe(q);
  const esperado = valorDe(d.saldo);
  return (
    <div>
      <Cabecalho titulo={d.iniciado ? "Conferir o cofre" : "Primeira contagem do cofre"} onFechar={onFechar} />
      <p className="mb-3 text-sm text-texto-suave">
        Conte tudo o que está no cofre agora e coloque a quantidade de cada nota e moeda.
        {d.iniciado && <> Pelo sistema deveria ter <b className="font-numero">{moedaBR(esperado)}</b>.</>}
      </p>
      <Contagem valor={q} onChange={setQ} />
      {d.iniciado && Math.abs(total - esperado) >= 0.005 && (
        <label className="mt-3 block text-sm">Motivo da diferença
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 min-h-11 w-full rounded-controle border border-borda bg-painel-cartao px-3" placeholder="Faltou registrar o troco do motoboy" />
        </label>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2"><span className={`text-xl ${TITULO}`}>{moedaBR(total)}</span>{d.iniciado && <Diferenca total={total} esperado={esperado} />}</span>
        <BotaoAcao className="btn-principal text-sm" aoClicar={async () => {
          if (!d.iniciado && !(await confirmar(`Começar o cofre com ${moedaBR(total)}?`))) return;
          const r = await conferirCofre({ contado: q, motivo });
          if (!r.ok) return avisar(r.mensagem);
          onFeito();
        }}>{d.iniciado ? "Salvar conferência" : "Salvar saldo inicial"}</BotaoAcao>
      </div>
    </div>
  );
}

function Historico({ d }: { d: DadosCofre }) {
  const router = useRouter();
  if (d.movimentos.length === 0) return <p className="text-sm text-texto-fraco">Ainda não tem movimentação.</p>;
  return (
    <div className="cartao p-4">
      <ul className="divide-y divide-borda">
        {d.movimentos.map((m) => {
          const v = Number(m.valor);
          return (
            <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
              <span className="text-sm">
                <span className="font-semibold">{TIPOS[m.tipo]?.rotulo ?? m.tipo}</span>
                {m.descricao && <> · {m.descricao}</>}
                <span className="block text-xs text-texto-fraco">
                  {m.quando}{m.criado_por_nome ? ` · ${m.criado_por_nome}` : ""}
                  {m.esperado != null && Math.abs(Math.abs(v) - Number(m.esperado)) >= 0.005 && ` · esperado ${moedaBR(Number(m.esperado))}`}
                </span>
                <span className="block text-xs text-texto-fraco">{descreverQuantidades(m.quantidades)}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-numero font-bold">{v > 0 ? "+" : v < 0 ? "−" : ""} {moedaBR(Math.abs(v))}</span>
                <BotaoAcao className="btn-secundario min-h-11 min-w-11 justify-center" aria-label="Desfazer" title="Desfazer" aoClicar={async () => {
                  if (!(await confirmar("Desfazer esta movimentação?", m.tipo === "pagamento" ? { detalhe: "A conta volta pro Contas a Pagar (ou é apagada, se foi criada aqui)." } : undefined))) return;
                  const r = await desfazerMovimento(m.id);
                  if (!r.ok) return avisar(r.mensagem);
                  router.refresh();
                }}><Icone nome="desfazer" tamanho={15} /></BotaoAcao>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Faixas({ d }: { d: DadosCofre }) {
  const router = useRouter();
  const [f, setF] = useState<Record<string, Faixa>>(() => Object.fromEntries(DENOMINACOES.map((c) => [String(c), d.faixas[String(c)] ?? { minimo: 0, maximo: 0 }])));
  const campo = (c: number, k: keyof Faixa) => (
    <input inputMode="numeric" aria-label={`${k === "minimo" ? "Mínimo" : "Máximo"} de ${rotuloDen(c)}`}
      value={f[String(c)][k] ? String(f[String(c)][k]) : ""}
      onChange={(e) => setF({ ...f, [String(c)]: { ...f[String(c)], [k]: Math.trunc(Number(e.target.value.replace(/\D/g, "")) || 0) } })}
      className="min-h-11 w-24 rounded-controle border border-borda bg-painel-cartao px-2 text-right font-numero" placeholder="0" />
  );
  return (
    <div className="cartao p-4">
      <p className="mb-3 text-sm text-texto-suave">Quantidade de cada nota e moeda (não o valor). Abaixo do mínimo aparece pra encomendar até o máximo; acima do máximo aparece pra depositar. Deixe 0 e 0 pra não controlar.</p>
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th className="rotulo pb-2 font-normal">Nota / moeda</th><th className="rotulo pb-2 text-right font-normal">Mínimo</th><th className="rotulo pb-2 text-right font-normal">Máximo</th></tr></thead>
        <tbody className="divide-y divide-borda">
          {DENOMINACOES.map((c) => (
            <tr key={c}>
              <td className="py-1.5">{rotuloDen(c)} <span className="text-xs text-texto-fraco">{gavetaDe(c) === "moedas" ? "moeda" : "nota"}</span></td>
              <td className="py-1.5 text-right">{campo(c, "minimo")}</td>
              <td className="py-1.5 text-right">{campo(c, "maximo")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <BotaoAcao className="btn-principal text-sm" aoClicar={async () => {
          const r = await salvarFaixas(DENOMINACOES.map((c) => ({ centavos: c, ...f[String(c)] })));
          if (!r.ok) return avisar(r.mensagem);
          await avisar("Mínimo e máximo salvos.");
          router.refresh();
        }}>Salvar</BotaoAcao>
      </div>
    </div>
  );
}
