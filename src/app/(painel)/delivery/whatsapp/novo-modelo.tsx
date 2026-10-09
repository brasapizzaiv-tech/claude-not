"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GATILHOS } from "@/lib/whatsapp-catalogo";
import { criarModelo } from "../campanhas/actions";

const inp = "w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm";
const RODAPE_PADRAO = "Responda SAIR para não receber promoções";

// Cria um modelo de texto na Meta. Cada {{n}} no texto pede um exemplo (a Meta
// recusa sem). Os textos sugeridos dos gatilhos entram com um clique.
export function NovoModelo() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState<"MARKETING" | "UTILITY">("MARKETING");
  const [corpo, setCorpo] = useState("");
  const [rodape, setRodape] = useState(RODAPE_PADRAO);
  const [exemplos, setExemplos] = useState<string[]>([]);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, startEnviar] = useTransition();

  const nVars = Math.max(0, ...[...corpo.matchAll(/\{\{(\d+)\}\}/g)].map((x) => Number(x[1])));
  const nomeLimpo = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");

  function usarSugestao(chave: string) {
    const g = GATILHOS.find((x) => x.chave === chave);
    if (!g) return;
    setNome(g.chave);
    setCategoria(g.marketing ? "MARKETING" : "UTILITY");
    setCorpo(g.exemplo);
    setRodape(g.marketing ? RODAPE_PADRAO : "");
    const EX: Record<string, string> = { nome: "Rafael", link: "https://www.brasarestaurante.com.br/pedir", cupom: "BRASA10", cashback_saldo: "R$ 12,50", cashback_valor: "R$ 12,50", cashback_vence: "15/10", dias_sem: "35", restaurante: "Brasa" };
    setExemplos(g.variaveisSugeridas.map((v) => EX[v] ?? ""));
  }

  function criar() {
    setAviso(null);
    startEnviar(async () => {
      const r = await criarModelo({ nome, categoria, corpo, rodape: rodape || null, exemplos });
      if (!r.ok) { setAviso({ ok: false, texto: r.mensagem }); return; }
      setAviso({ ok: true, texto: `Modelo ${r.nome} enviado pra Meta (${r.status === "APPROVED" ? "já aprovado" : "em análise"}). Recarregue em alguns minutos.` });
      setNome(""); setCorpo(""); setExemplos([]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-cartao border border-borda p-4 text-sm">
      <h2 className="font-semibold">Novo modelo</h2>
      <label className="block">
        <span className="text-xs text-texto-suave">Começar de um texto sugerido</span>
        <select value="" onChange={(e) => usarSugestao(e.target.value)} className={inp}>
          <option value="">— escolher (opcional) —</option>
          {GATILHOS.map((g) => <option key={g.chave} value={g.chave}>{g.titulo}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-texto-suave">Nome (só letras minúsculas, números e _)</span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: promo_quarta" className={inp} />
        {nome && nomeLimpo !== nome && <span className="text-xs text-texto-fraco">Vai como: {nomeLimpo}</span>}
      </label>
      <div className="flex gap-4">
        {(["MARKETING", "UTILITY"] as const).map((c) => (
          <label key={c} className="flex items-center gap-2"><input type="radio" checked={categoria === c} onChange={() => setCategoria(c)} /> {c === "MARKETING" ? "Marketing" : "Utilidade"}</label>
        ))}
      </div>
      <p className="text-xs text-texto-fraco">Promoção, convite pra voltar, aniversário: marketing. Agradecimento de pedido e aviso de cashback ganho: utilidade (mais barato). Se a Meta achar que é promoção, ela muda pra marketing.</p>
      <label className="block">
        <span className="text-xs text-texto-suave">Texto. Use {"{{1}}"}, {"{{2}}"}... onde entra o nome, o link etc.</span>
        <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={5} className={inp} />
      </label>
      {nVars > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-texto-suave">Exemplo de cada variável (a Meta pede pra aprovar)</span>
          {Array.from({ length: nVars }, (_, i) => (
            <label key={i} className="flex items-center gap-2">
              <span className="w-10 font-mono text-xs text-texto-suave">{`{{${i + 1}}}`}</span>
              <input value={exemplos[i] ?? ""} onChange={(e) => { const v = [...exemplos]; v[i] = e.target.value; setExemplos(v); }} className={inp} />
            </label>
          ))}
        </div>
      )}
      <label className="block">
        <span className="text-xs text-texto-suave">Rodapé (opcional, até 60 letras)</span>
        <input value={rodape} onChange={(e) => setRodape(e.target.value.slice(0, 60))} className={inp} />
      </label>
      <button type="button" disabled={enviando || !nomeLimpo || !corpo.trim()} onClick={criar} className="rounded-controle bg-texto px-4 py-2 font-semibold text-fundo disabled:opacity-40">
        {enviando ? "Enviando pra Meta..." : "Enviar pra aprovação"}
      </button>
      {aviso && <p className={aviso.ok ? "text-emerald-600" : "text-red-600"}>{aviso.texto}</p>}
    </div>
  );
}
