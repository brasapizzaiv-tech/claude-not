"use client";

import { useState, useTransition } from "react";
import type { ModeloWpp } from "@/lib/whatsapp";
import { VARIAVEIS, type Variavel } from "@/lib/whatsapp-catalogo";
import { enviarTeste, subirImagemCampanha } from "./actions";

const inp = "rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm";
const EXEMPLO: Record<Variavel, string> = {
  nome: "Rafael", link: "brasarestaurante.com.br/pedir", cupom: "BRASA10",
  cashback_saldo: "R$ 12,50", cashback_valor: "R$ 12,50", cashback_vence: "15/10/2026", dias_sem: "35", restaurante: "Brasa",
};

export type EscolhaModelo = { modelo: string; idioma: string; variaveis: string[]; imagemUrl: string | null };

// Escolhe um modelo aprovado pela Meta, liga cada {{n}} a um dado e mostra a
// prévia de como chega. Se o modelo tem imagem no topo, pede a imagem.
export function SeletorModelo({
  modelos, valor, onChange, sugeridas = ["nome", "link"], cupom = null,
}: {
  modelos: ModeloWpp[];
  valor: EscolhaModelo;
  onChange: (v: EscolhaModelo) => void;
  sugeridas?: Variavel[];
  cupom?: string | null;
}) {
  const aprovados = modelos.filter((m) => m.status === "APPROVED");
  const m = aprovados.find((x) => x.nome === valor.modelo && x.idioma === valor.idioma) ?? aprovados.find((x) => x.nome === valor.modelo);
  const [subindo, startSubir] = useTransition();
  const [msgImg, setMsgImg] = useState<string | null>(null);
  const [tel, setTel] = useState("");
  const [testando, startTeste] = useTransition();
  const [msgTeste, setMsgTeste] = useState<string | null>(null);

  function escolher(chave: string) {
    const [nome, idioma] = chave.split("|");
    const novo = aprovados.find((x) => x.nome === nome && x.idioma === idioma);
    const vars = Array.from({ length: novo?.nVars ?? 0 }, (_, i) => valor.variaveis[i] ?? sugeridas[i] ?? "nome");
    onChange({ modelo: nome ?? "", idioma: idioma || "pt_BR", variaveis: vars, imagemUrl: novo?.cabecalho === "IMAGE" ? valor.imagemUrl : null });
  }

  const previa = m
    ? m.corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => {
        const k = valor.variaveis[Number(n) - 1] as Variavel | undefined;
        return k === "cupom" && cupom ? cupom : k ? EXEMPLO[k] : `{{${n}}}`;
      })
    : "";

  return (
    <div className="space-y-3">
      {aprovados.length === 0 ? (
        <p className="rounded-controle bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Nenhum modelo aprovado ainda. Crie em Delivery, Campanhas, Modelos e limites. A Meta costuma aprovar em minutos.
        </p>
      ) : (
        <select value={m ? `${m.nome}|${m.idioma}` : ""} onChange={(e) => escolher(e.target.value)} className={`${inp} w-full`}>
          <option value="">— escolher modelo aprovado —</option>
          {aprovados.map((x) => (
            <option key={`${x.nome}|${x.idioma}`} value={`${x.nome}|${x.idioma}`}>
              {x.nome} · {x.categoria === "MARKETING" ? "marketing" : x.categoria === "UTILITY" ? "utilidade" : x.categoria.toLowerCase()}{x.cabecalho === "IMAGE" ? " · com imagem" : ""}
            </option>
          ))}
        </select>
      )}

      {m && m.nVars > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: m.nVars }, (_, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <span className="w-12 shrink-0 font-mono text-xs text-texto-suave">{`{{${i + 1}}}`}</span>
              <select
                value={valor.variaveis[i] ?? ""}
                onChange={(e) => { const v = [...valor.variaveis]; v[i] = e.target.value; onChange({ ...valor, variaveis: v }); }}
                className={`${inp} min-w-0 flex-1`}
              >
                {Object.entries(VARIAVEIS).map(([k, rot]) => <option key={k} value={k}>{rot}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      {m?.cabecalho === "IMAGE" && (
        <div className="flex flex-wrap items-center gap-3 rounded-controle border border-borda p-3">
          {valor.imagemUrl ? <img src={valor.imagemUrl} alt="" className="h-16 w-16 rounded object-cover" /> : <span className="text-sm text-texto-suave">Este modelo leva imagem no topo.</span>}
          <label className="cursor-pointer rounded-controle border border-borda-forte px-3 py-1.5 text-sm font-semibold">
            {subindo ? "Enviando..." : valor.imagemUrl ? "Trocar imagem" : "Carregar imagem"}
            <input
              type="file" accept="image/jpeg,image/png" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) return;
                const fd = new FormData(); fd.set("arquivo", f);
                setMsgImg(null);
                startSubir(async () => {
                  const r = await subirImagemCampanha(fd);
                  if (r.ok) onChange({ ...valor, imagemUrl: r.url }); else setMsgImg(r.mensagem);
                });
              }}
            />
          </label>
          {msgImg && <span className="text-xs text-red-600">{msgImg}</span>}
        </div>
      )}

      {m && (
        <div className="rounded-cartao bg-[#e7f5df] p-3 text-sm text-zinc-900 dark:bg-[#1f3a2a] dark:text-zinc-100">
          {valor.imagemUrl && m.cabecalho === "IMAGE" && <img src={valor.imagemUrl} alt="" className="mb-2 max-h-40 rounded" />}
          <div className="whitespace-pre-wrap">{previa}</div>
          {m.rodape && <div className="mt-1 text-xs opacity-60">{m.rodape}</div>}
        </div>
      )}

      {m && (
        <div className="flex flex-wrap items-center gap-2">
          <input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" placeholder="Seu WhatsApp pra teste" className={`${inp} w-48`} />
          <button
            type="button"
            disabled={testando || tel.replace(/\D/g, "").length < 10}
            onClick={() => { setMsgTeste(null); startTeste(async () => { const r = await enviarTeste({ telefone: tel, modelo: valor.modelo, idioma: valor.idioma, variaveis: valor.variaveis, cupom, imagemUrl: valor.imagemUrl }); setMsgTeste(r.ok ? "Teste enviado. Confira no seu WhatsApp." : r.mensagem); }); }}
            className="rounded-controle border border-borda-forte px-3 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {testando ? "Enviando..." : "Enviar teste"}
          </button>
          {msgTeste && <span className="text-xs text-texto-suave">{msgTeste}</span>}
        </div>
      )}
    </div>
  );
}
