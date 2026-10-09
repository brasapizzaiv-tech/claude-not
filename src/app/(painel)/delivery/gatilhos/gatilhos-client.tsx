"use client";

import { useState, useTransition } from "react";
import { Icone, type NomeIcone } from "@/components/icone";
import type { ModeloWpp } from "@/lib/whatsapp";
import { GATILHOS, type GatilhoDef } from "@/lib/whatsapp-catalogo";
import { salvarGatilho } from "../campanhas/actions";
import { SeletorModelo, type EscolhaModelo } from "../campanhas/seletor-modelo";

export type GatilhoSalvo = { ativo: boolean; modelo: string | null; idioma: string; variaveis: string[]; dias: number | null; cupom: string | null; imagem_url: string | null };

const inp = "rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm";

export function CartoesGatilhos({ modelos, salvos, cupons, enviados30 }: {
  modelos: ModeloWpp[]; salvos: Record<string, GatilhoSalvo>; cupons: string[]; enviados30: Record<string, number>;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {GATILHOS.map((g) => (
        <Cartao key={g.chave} def={g} salvo={salvos[g.chave]} modelos={modelos} cupons={cupons} enviados={enviados30[g.chave] ?? 0}
          aberto={aberto === g.chave} abrir={() => setAberto(aberto === g.chave ? null : g.chave)} />
      ))}
    </div>
  );
}

function Cartao({ def, salvo, modelos, cupons, enviados, aberto, abrir }: {
  def: GatilhoDef; salvo?: GatilhoSalvo; modelos: ModeloWpp[]; cupons: string[]; enviados: number; aberto: boolean; abrir: () => void;
}) {
  const [ativo, setAtivo] = useState(salvo?.ativo ?? false);
  const [msg, setMsg] = useState<EscolhaModelo>({ modelo: salvo?.modelo ?? "", idioma: salvo?.idioma ?? "pt_BR", variaveis: salvo?.variaveis ?? [], imagemUrl: salvo?.imagem_url ?? null });
  const [dias, setDias] = useState(String(salvo?.dias ?? def.dias?.padrao ?? ""));
  const [cupom, setCupom] = useState(salvo?.cupom ?? "");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, startSalvar] = useTransition();
  const usaCupom = msg.variaveis.includes("cupom");

  function salvar(novoAtivo = ativo) {
    setAviso(null);
    startSalvar(async () => {
      const r = await salvarGatilho({
        chave: def.chave, ativo: novoAtivo, modelo: msg.modelo || null, idioma: msg.idioma, variaveis: msg.variaveis,
        dias: def.dias ? Number(dias) : null, cupom: cupom || null, imagemUrl: msg.imagemUrl,
      });
      if (r.ok) { setAtivo(novoAtivo); setAviso({ ok: true, texto: novoAtivo ? "Salvo e ligado." : "Salvo (desligado)." }); }
      else setAviso({ ok: false, texto: r.mensagem });
    });
  }

  return (
    <div className={`rounded-cartao border p-4 ${ativo ? "border-emerald-600/50" : "border-borda"} ${aberto ? "md:col-span-2" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ativo ? "bg-emerald-600 text-white" : "bg-superficie-suave text-texto-suave"}`}>
          <Icone nome={def.icone as NomeIcone} tamanho={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{def.titulo}</p>
          <p className="text-sm text-texto-suave">{def.descricao}</p>
          <p className="mt-1 text-xs text-texto-fraco">
            {ativo ? `Ligado · modelo ${salvo?.modelo ?? msg.modelo}` : "Desligado"} · {enviados} enviadas em 30 dias · {def.marketing ? "categoria marketing" : "categoria utilidade"}
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm" title={!msg.modelo ? "Escolha o modelo primeiro" : undefined}>
          <input type="checkbox" checked={ativo} disabled={salvando || (!ativo && !msg.modelo)} onChange={(e) => salvar(e.target.checked)} className="h-5 w-5 accent-emerald-600" />
          {ativo ? "Ligado" : "Ligar"}
        </label>
      </div>

      <button type="button" onClick={abrir} className="mt-3 text-sm font-semibold text-emerald-600">{aberto ? "Fechar" : msg.modelo ? "Editar mensagem" : "Configurar mensagem"}</button>

      {aberto && (
        <div className="mt-3 space-y-3 border-t border-borda pt-3">
          <div className="rounded-controle bg-superficie-suave p-3 text-sm">
            <p className="mb-1 text-xs text-texto-suave">Texto sugerido pra criar o modelo na Meta ({def.marketing ? "marketing" : "utilidade"}):</p>
            <p className="whitespace-pre-wrap">{def.exemplo}</p>
          </div>
          <SeletorModelo modelos={modelos} valor={msg} onChange={setMsg} sugeridas={def.variaveisSugeridas} cupom={cupom || null} />
          {def.dias && (
            <label className="flex flex-wrap items-center gap-2 text-sm">{def.dias.rotulo}: <input value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric" className={`${inp} w-20 text-right`} /></label>
          )}
          {usaCupom && (
            <label className="flex flex-wrap items-center gap-2 text-sm">Cupom:
              {cupons.length ? (
                <select value={cupom} onChange={(e) => setCupom(e.target.value)} className={inp}>
                  <option value="">— escolher —</option>
                  {cupons.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : <span className="text-texto-suave">nenhum cupom ativo (crie em Delivery, Cupons)</span>}
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={salvando} onClick={() => salvar()} className="rounded-controle bg-texto px-4 py-2 text-sm font-semibold text-fundo disabled:opacity-40">{salvando ? "Salvando..." : "Salvar"}</button>
            {aviso && <span className={`text-sm ${aviso.ok ? "text-emerald-600" : "text-red-600"}`}>{aviso.texto}</span>}
          </div>
        </div>
      )}
      {!aberto && aviso && <p className={`mt-2 text-sm ${aviso.ok ? "text-emerald-600" : "text-red-600"}`}>{aviso.texto}</p>}
    </div>
  );
}
