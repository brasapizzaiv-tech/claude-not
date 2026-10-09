"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icone } from "@/components/icone";
import type { ModeloWpp } from "@/lib/whatsapp";
import { PUBLICOS, type TipoPublico } from "@/lib/whatsapp-catalogo";
import { contarPublico, criarCampanha } from "../actions";
import { SeletorModelo, type EscolhaModelo } from "../seletor-modelo";

const inp = "rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm";
const DIAS = [[1, "S"], [2, "T"], [3, "Q"], [4, "Q"], [5, "S"], [6, "S"], [0, "D"]] as const;
const NOME_DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PRECISA_DIAS: TipoPublico[] = ["recentes", "inativos"];

// Campanha em 5 passos (nome, público, horário, cupom, mensagem), igual ao
// Manda Pedido. Cada passo fechado mostra o resumo do que foi escolhido.
export function NovaCampanha({ modelos, cupons, limiteDia, precoMarketing, precoUtilidade }: {
  modelos: ModeloWpp[]; cupons: string[]; limiteDia: number; precoMarketing: number | null; precoUtilidade: number | null;
}) {
  const router = useRouter();
  const [passo, setPasso] = useState(1);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoPublico>("todos");
  const [diasPub, setDiasPub] = useState("30");
  const [minPub, setMinPub] = useState("3");
  const [contagem, setContagem] = useState<number | null>(null);
  const [contando, startContar] = useTransition();
  const [dias, setDias] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6]));
  const [horaIni, setHoraIni] = useState("10:00");
  const [horaFim, setHoraFim] = useState("19:00");
  const [comCupom, setComCupom] = useState(false);
  const [cupom, setCupom] = useState(cupons[0] ?? "");
  const [msg, setMsg] = useState<EscolhaModelo>({ modelo: "", idioma: "pt_BR", variaveis: [], imagemUrl: null });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();

  const modelo = modelos.find((m) => m.nome === msg.modelo && m.idioma === msg.idioma);
  const preco = modelo?.categoria === "UTILITY" ? precoUtilidade : precoMarketing;
  const cupomFinal = comCupom && cupom ? cupom : null;

  function contar() {
    startContar(async () => setContagem(await contarPublico(tipo, PRECISA_DIAS.includes(tipo) ? Number(diasPub) || 30 : null, tipo === "frequentes" ? Number(minPub) || 3 : null)));
  }
  const resumoPublico = `${PUBLICOS[tipo].replace("X dias", `${diasPub} dias`).replace("X vezes", `${minPub} vezes`)}${contagem != null ? ` · ${contagem} clientes` : ""}`;
  const resumoHorario = `${[...dias].sort().map((d) => NOME_DIA[d]).join(", ")} das ${horaIni} às ${horaFim}`;

  function salvar(lancar: boolean) {
    setErro(null);
    startSalvar(async () => {
      const r = await criarCampanha({
        nome, publico: { tipo, dias: PRECISA_DIAS.includes(tipo) ? Number(diasPub) || 30 : null, min: tipo === "frequentes" ? Number(minPub) || 3 : null },
        dias: [...dias], horaIni, horaFim, cupom: cupomFinal,
        modelo: msg.modelo, idioma: msg.idioma, variaveis: msg.variaveis, imagemUrl: msg.imagemUrl,
      }, lancar);
      if (!r.ok) { setErro(r.mensagem); return; }
      router.push(`/delivery/campanhas/${r.id}`);
    });
  }

  // Funções de desenho (não componentes): componente criado dentro do render
  // remontaria os campos a cada tecla e o cursor sairia do lugar.
  const bloco = (n: number, titulo: string, resumo: string, children: React.ReactNode) => (
    <div className="rounded-cartao border border-borda">
      <button type="button" onClick={() => setPasso(n)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${passo > n ? "bg-emerald-600 text-white" : passo === n ? "bg-texto text-fundo" : "bg-superficie-suave text-texto-suave"}`}>
          {passo > n ? <Icone nome="certo" tamanho={13} /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{titulo}</span>
          {passo !== n && <span className="block truncate text-xs text-texto-suave">{resumo}</span>}
        </span>
      </button>
      {passo === n && <div className="border-t border-borda px-4 py-3">{children}</div>}
    </div>
  );
  const navega = (pode = true, voltar = true) => (
    <div className="mt-3 flex justify-between">
      {voltar ? <button type="button" onClick={() => setPasso(passo - 1)} className="rounded-controle border border-borda-forte px-3 py-1.5 text-sm">← Voltar</button> : <span />}
      <button type="button" disabled={!pode} onClick={() => setPasso(passo + 1)} className="rounded-controle bg-texto px-4 py-1.5 text-sm font-semibold text-fundo disabled:opacity-40">Próximo →</button>
    </div>
  );

  return (
    <div className="space-y-3">
      {bloco(1, "Nome da campanha", nome || "Pra você achar depois", <>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Quarta da pizza grande" className={`${inp} w-full`} />
        {navega(nome.trim().length >= 2, false)}
      </>)}

      {bloco(2, "Público", resumoPublico, <>
        <div className="space-y-1.5">
          {(Object.keys(PUBLICOS) as TipoPublico[]).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <input type="radio" name="publico" checked={tipo === t} onChange={() => { setTipo(t); setContagem(null); }} />
              {PUBLICOS[t]}
            </label>
          ))}
        </div>
        {PRECISA_DIAS.includes(tipo) && (
          <label className="mt-2 flex items-center gap-2 text-sm">X = <input value={diasPub} onChange={(e) => { setDiasPub(e.target.value); setContagem(null); }} inputMode="numeric" className={`${inp} w-20 text-right`} /> dias</label>
        )}
        {tipo === "frequentes" && (
          <label className="mt-2 flex items-center gap-2 text-sm">X = <input value={minPub} onChange={(e) => { setMinPub(e.target.value); setContagem(null); }} inputMode="numeric" className={`${inp} w-20 text-right`} /> compras</label>
        )}
        <div className="mt-3 flex items-center gap-3 text-sm">
          <button type="button" onClick={contar} disabled={contando} className="rounded-controle border border-borda-forte px-3 py-1.5 font-semibold">{contando ? "Contando..." : "Quantos clientes?"}</button>
          {contagem != null && (
            <span>
              <b>{contagem}</b> clientes
              {contagem > limiteDia ? ` · leva uns ${Math.ceil(contagem / limiteDia)} dias (limite de ${limiteDia} por dia)` : ""}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-texto-suave">Fica de fora quem respondeu SAIR ou marcou que não quer promoções.</p>
        {navega()}
      </>)}

      {bloco(3, "Horário de envio", resumoHorario, <>
        <p className="mb-2 text-xs text-texto-suave">Horário de Brasília. Fora da faixa, a campanha espera o próximo dia marcado.</p>
        <div className="mb-3 flex gap-1.5">
          {DIAS.map(([d, l]) => (
            <button key={d} type="button" onClick={() => setDias((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n; })}
              className={`h-8 w-8 rounded-full border text-xs font-bold ${dias.has(d) ? "border-emerald-600 bg-emerald-600 text-white" : "border-borda-forte text-texto-suave"}`}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          Das <input type="time" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} className={inp} /> até <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className={inp} />
        </div>
        {navega(dias.size > 0 && !!horaIni && !!horaFim)}
      </>)}

      {bloco(4, "Cupom de desconto (opcional)", cupomFinal ? `Link já abre com o cupom ${cupomFinal}` : "Sem cupom", <>
        <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={comCupom} onChange={(e) => setComCupom(e.target.checked)} className="h-4 w-4" /> Anexar cupom ao link da campanha</label>
        {comCupom && (cupons.length ? (
          <select value={cupom} onChange={(e) => setCupom(e.target.value)} className={inp}>
            {cupons.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : <p className="text-sm text-texto-suave">Nenhum cupom ativo. Crie em Delivery, Cupons.</p>)}
        {navega()}
      </>)}

      {bloco(5, "Mensagem", msg.modelo || "Escolha o modelo aprovado", <>
        <SeletorModelo modelos={modelos} valor={msg} onChange={setMsg} cupom={cupomFinal} />
        {contagem != null && preco != null && msg.modelo && (
          <p className="mt-3 text-sm text-texto-suave">Custo estimado na Meta: <b>{brl(contagem * preco)}</b> ({contagem} × {brl(preco)}).</p>
        )}
        {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <button type="button" onClick={() => setPasso(4)} className="rounded-controle border border-borda-forte px-3 py-1.5 text-sm">← Voltar</button>
          <div className="flex gap-2">
            <button type="button" disabled={salvando} onClick={() => salvar(false)} className="rounded-controle border border-borda-forte px-4 py-2 text-sm font-semibold disabled:opacity-40">Salvar rascunho</button>
            <button type="button" disabled={salvando || !msg.modelo || nome.trim().length < 2} onClick={() => salvar(true)} className="inline-flex items-center gap-1.5 rounded-controle bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              <Icone nome="mandar" tamanho={15} /> {salvando ? "Lançando..." : "Lançar"}
            </button>
          </div>
        </div>
      </>)}
    </div>
  );
}
