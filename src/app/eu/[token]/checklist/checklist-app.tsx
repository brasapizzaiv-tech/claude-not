"use client";
import { Icone } from "@/components/icone";

// Checklists no celular, na correria: letra grande, alvo de toque generoso,
// salva a cada marcação e guarda o que não subiu quando a internet cai.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ROTULO_MOMENTO, itemRespondido, porSecao, type Execucao, type Modelo, type ModeloItem,
  type Momento, type Resposta, type Situacao,
} from "@/lib/checklists-core";
import { abrirListaApp, concluirListaApp, enviarFotoApp, salvarRespostaApp } from "./actions";

export type ListaApp = {
  modelo: Modelo; setor: string; cor: string | null;
  itens: ModeloItem[]; execucao: Execucao | null; respostas: Resposta[]; situacao: Situacao;
};

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

// ---------- fila offline ----------
// Marcação, número e texto ficam guardados no aparelho quando a internet cai e
// sobem sozinhos quando volta. Foto não entra na fila (imagem enche a memória
// do navegador): sem sinal, a pessoa marca o item e tira a foto depois.
type Pendente = { execucaoId: string; itemId: string; dados: { feito?: boolean; valor?: number | null; texto?: string | null } };
const CHAVE_FILA = "checklist_fila";
const lerFila = (): Pendente[] => {
  try { return JSON.parse(localStorage.getItem(CHAVE_FILA) || "[]") as Pendente[]; } catch { return []; }
};
const gravarFila = (f: Pendente[]) => { try { localStorage.setItem(CHAVE_FILA, JSON.stringify(f.slice(-200))); } catch { /* cheio */ } };

// Comprime a foto antes de subir (celular ruim, internet fraca): lado maior
// 1280 px, JPEG 70%. Se algo der errado, manda o arquivo original.
async function comprimir(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1280;
    const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala), h = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.7));
    if (!blob) return file;
    return new File([blob], "foto.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function ChecklistApp({
  token, dia, listas, momentoAgora,
}: {
  token: string; dia: string; listas: ListaApp[]; momentoAgora: Momento;
}) {
  const router = useRouter();
  const [aberta, setAberta] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const [online, setOnline] = useState(true);

  // Reenvia o que ficou na fila quando a internet volta (e ao abrir a tela).
  const escoar = useCallback(async () => {
    const fila = lerFila();
    if (fila.length === 0) { setPendentes(0); return; }
    const restantes: Pendente[] = [];
    for (const p of fila) {
      try {
        const r = await salvarRespostaApp(token, p.execucaoId, p.itemId, p.dados);
        if (!r.ok) restantes.push(p);
      } catch {
        restantes.push(p);
      }
    }
    gravarFila(restantes);
    setPendentes(restantes.length);
    if (restantes.length < fila.length) router.refresh();
  }, [token, router]);

  useEffect(() => {
    // setTimeout(0): o lint proíbe mexer no estado direto dentro do effect, e
    // navigator/localStorage só existem depois que a página monta.
    const inicio = setTimeout(() => { setOnline(navigator.onLine); setPendentes(lerFila().length); }, 0);
    const voltou = () => { setOnline(true); escoar(); };
    const caiu = () => setOnline(false);
    window.addEventListener("online", voltou);
    window.addEventListener("offline", caiu);
    const t = setTimeout(escoar, 400);
    return () => { window.removeEventListener("online", voltou); window.removeEventListener("offline", caiu); clearTimeout(t); clearTimeout(inicio); };
  }, [escoar]);

  function enfileirar(p: Pendente) {
    const fila = lerFila().filter((x) => !(x.execucaoId === p.execucaoId && x.itemId === p.itemId && Object.keys(x.dados)[0] === Object.keys(p.dados)[0]));
    fila.push(p);
    gravarFila(fila);
    setPendentes(fila.length);
  }

  const porMomento = (m: Momento) => listas.filter((l) => l.modelo.momento === m);
  const aberto = listas.find((l) => l.modelo.id === aberta) ?? null;

  if (aberto) {
    return (
      <ExecutarLista
        token={token} dia={dia} lista={aberto}
        onVoltar={() => setAberta(null)}
        onFila={enfileirar}
        online={online}
        setMsg={setMsg}
        msg={msg}
      />
    );
  }

  return (
    <div>
      <h1 className="mt-2 text-xl font-bold text-texto"><Icone nome="checklist" tamanho={18} className="mr-2" /> Checklists</h1>
      <p className="mb-3 text-sm text-texto-suave">{dia === new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) ? "Hoje" : dia.split("-").reverse().join("/")}</p>

      {!online && <Aviso tipo="off">Sem internet. O que você marcar fica guardado e sobe sozinho quando voltar.</Aviso>}
      {online && pendentes > 0 && <Aviso tipo="fila">{pendentes} marcação(ões) esperando pra subir…</Aviso>}
      {msg && <Aviso tipo="msg">{msg}</Aviso>}

      {listas.length === 0 && (
        <p className="mt-8 rounded-cartao bg-painel-cartao p-8 text-center text-texto-fraco">
          Nenhuma lista pra hoje no seu setor.
        </p>
      )}

      {(["abertura", "turno", "fechamento"] as Momento[]).map((m) => {
        const doMomento = porMomento(m);
        if (doMomento.length === 0) return null;
        return (
          <div key={m} className="mt-4">
            <p className={`mb-2 text-xs font-bold  ${m === momentoAgora ? "text-orange-600" : "text-texto-fraco"}`}>
              {ROTULO_MOMENTO[m]}{m === momentoAgora ? " · agora" : ""}
            </p>
            <div className="space-y-2">
              {doMomento.map((l) => (
                <button
                  key={l.modelo.id}
                  onClick={() => setAberta(l.modelo.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-cartao border border-borda bg-painel-cartao p-4 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-bold text-texto">{l.modelo.nome}</span>
                    <span className="block text-xs" style={{ color: l.cor ?? undefined }}>{l.setor}</span>
                    {l.execucao && !l.situacao.concluida && (
                      <span className="mt-0.5 block text-xs text-amber-600">
                        {l.execucao.iniciado_nome ?? "alguém"} começou às {hora(l.execucao.iniciado_em)}
                      </span>
                    )}
                    {l.situacao.concluida && l.execucao?.concluido_em && (
                      <span className="mt-0.5 block text-xs text-emerald-600">
                        ✓ {l.execucao.concluido_nome ?? "concluída"} às {hora(l.execucao.concluido_em)}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block text-lg font-bold ${l.situacao.concluida ? "text-emerald-600" : l.situacao.feitos > 0 ? "text-amber-600" : "text-texto-fraco"}`}>
                      {l.situacao.feitos}/{l.situacao.total}
                    </span>
                    <span className="text-xs text-texto-fraco">{l.situacao.concluida ? "concluída" : l.situacao.iniciada ? "em andamento" : "não iniciada"}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Aviso({ tipo, children }: { tipo: "off" | "fila" | "msg"; children: React.ReactNode }) {
  const cls = tipo === "off"
    ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    : tipo === "fila"
      ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200"
      : "bg-superficie-suave text-texto-suave  ";
  return <p className={`mb-3 rounded-cartao px-3 py-2 text-sm font-medium ${cls}`}>{children}</p>;
}

// ---------- execução de uma lista ----------
function ExecutarLista({
  token, dia, lista, onVoltar, onFila, online, msg, setMsg,
}: {
  token: string; dia: string; lista: ListaApp; onVoltar: () => void;
  onFila: (p: Pendente) => void; online: boolean;
  msg: string | null; setMsg: (s: string | null) => void;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [execucaoId, setExecucaoId] = useState<string | null>(lista.execucao?.id ?? null);
  const [resp, setResp] = useState<Record<string, { feito?: boolean; valor?: number | null; texto?: string | null; foto_url?: string | null }>>(() => {
    const r: Record<string, { feito?: boolean; valor?: number | null; texto?: string | null; foto_url?: string | null }> = {};
    for (const x of lista.respostas) r[x.item_id] = { feito: x.feito, valor: x.valor, texto: x.texto, foto_url: x.foto_url };
    return r;
  });
  const [subindo, setSubindo] = useState<string | null>(null);
  const [concluida, setConcluida] = useState(lista.situacao.concluida);
  const abrindo = useRef(false);

  // Abre a execução do dia ao entrar (ou reaproveita a de quem já começou).
  useEffect(() => {
    if (execucaoId || abrindo.current) return;
    abrindo.current = true;
    (async () => {
      const r = await abrirListaApp(token, lista.modelo.id, dia);
      if (r.ok && "execucao" in r) {
        setExecucaoId(r.execucao.id);
        if (r.jaExistia && r.execucao.iniciado_nome) setMsg(`${r.execucao.iniciado_nome} já começou esta lista — vocês estão na mesma.`);
      } else if (!r.ok) {
        setMsg(r.mensagem);
      }
      abrindo.current = false;
    })();
  }, [execucaoId, token, lista.modelo.id, dia, setMsg]);

  function gravar(itemId: string, dados: { feito?: boolean; valor?: number | null; texto?: string | null }) {
    setResp((s) => ({ ...s, [itemId]: { ...s[itemId], ...dados } }));
    if (!execucaoId) return;
    if (!online) { onFila({ execucaoId, itemId, dados }); return; }
    (async () => {
      try {
        const r = await salvarRespostaApp(token, execucaoId, itemId, dados);
        if (!r.ok) onFila({ execucaoId, itemId, dados });
      } catch {
        onFila({ execucaoId, itemId, dados });
      }
    })();
  }

  async function mandarFoto(itemId: string, file: File) {
    if (!execucaoId) return;
    if (!online) { setMsg("Sem internet: a foto precisa de conexão. Marque o item e tire a foto quando voltar."); return; }
    setSubindo(itemId);
    setMsg(null);
    try {
      const menor = await comprimir(file);
      const form = new FormData();
      form.set("foto", menor);
      const r = await enviarFotoApp(token, execucaoId, itemId, form);
      if (!r.ok) setMsg(r.mensagem);
      else setResp((s) => ({ ...s, [itemId]: { ...s[itemId], foto_url: r.url } }));
    } catch {
      setMsg("Não consegui enviar a foto. Tente de novo.");
    } finally {
      setSubindo(null);
    }
  }

  const itensOk = lista.itens.filter((i) =>
    itemRespondido(i, { item_id: i.id, feito: !!resp[i.id]?.feito, valor: resp[i.id]?.valor ?? null, texto: resp[i.id]?.texto ?? null, foto_url: resp[i.id]?.foto_url ?? null } as Resposta),
  );
  const faltamObrig = lista.itens.filter((i) => i.obrigatorio && !itensOk.includes(i));

  function concluir() {
    if (!execucaoId) return;
    setMsg(null);
    start(async () => {
      const r = await concluirListaApp(token, execucaoId);
      if (!r.ok) { setMsg(r.mensagem); return; }
      setConcluida(true);
      setMsg("✓ Lista concluída!");
      router.refresh();
    });
  }

  return (
    <div>
      <button onClick={onVoltar} className="mt-2 text-sm text-texto-suave">← Todas as listas</button>
      <h1 className="mt-1 text-xl font-bold text-texto">{lista.modelo.nome}</h1>
      <p className="mb-3 text-sm" style={{ color: lista.cor ?? undefined }}>
        {lista.setor} · {ROTULO_MOMENTO[lista.modelo.momento]}
      </p>

      {!online && <Aviso tipo="off">Sem internet. As marcações ficam guardadas e sobem sozinhas.</Aviso>}
      {msg && <Aviso tipo="msg">{msg}</Aviso>}
      {concluida && <Aviso tipo="msg">Lista concluída. As marcações ficam travadas.</Aviso>}

      <div className="space-y-2">
        {porSecao(lista.itens).map((grupo, gi) => (
          <div key={gi} className="space-y-2">
            {grupo.secao && (
              <p className="mt-3 text-xs font-bold text-orange-600">{grupo.secao}</p>
            )}
            {grupo.itens.map((i) => {
          const n = lista.itens.indexOf(i);
          const r = resp[i.id] ?? {};
          const ok = itensOk.includes(i);
          const travado = concluida || proc;
          return (
            <div
              key={i.id}
              className={`rounded-cartao border p-3 ${ok ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30" : "border-borda bg-painel-cartao  "}`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  disabled={travado || i.tipo !== "feito"}
                  onClick={() => gravar(i.id, { feito: !r.feito })}
                  className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-cartao border-2 text-2xl ${ok ? "border-emerald-500 bg-emerald-500 text-white" : "border-borda-forte text-transparent dark:border-zinc-600"}  ${i.tipo !== "feito" ? "opacity-60" : ""}`}
                  aria-label={i.tipo === "feito" ? "marcar feito" : "preencha abaixo"}
                >
                  ✓
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-snug text-texto">
                    <span className="mr-1.5 text-sm text-texto-fraco">{n + 1}.</span>
                    {i.texto}
                    {i.obrigatorio && <span className="ml-1 text-red-600">*</span>}
                  </p>
                  {i.instrucao && <p className="text-sm text-texto-suave">{i.instrucao}</p>}

                  {(i.tipo === "numero" || i.tipo === "contagem") && (
                    <input
                      inputMode="decimal"
                      disabled={travado}
                      defaultValue={r.valor != null ? String(r.valor).replace(".", ",") : ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        gravar(i.id, { valor: v === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")) || 0 });
                      }}
                      placeholder={i.tipo === "contagem" ? "quantidade" : "valor"}
                      className="mt-2 h-12 w-full rounded-cartao border border-borda-forte bg-white px-3 text-lg text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950"
                    />
                  )}
                  {i.tipo === "texto" && (
                    <textarea
                      rows={2}
                      disabled={travado}
                      defaultValue={r.texto ?? ""}
                      onBlur={(e) => gravar(i.id, { texto: e.target.value.trim() || null })}
                      placeholder="Escreva aqui"
                      className="mt-2 w-full rounded-cartao border border-borda-forte bg-white px-3 py-2 text-base text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950"
                    />
                  )}

                  {i.exige_foto && (
                    <div className="mt-2 flex items-center gap-2">
                      {r.foto_url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={r.foto_url} alt="foto do item" className="h-16 w-16 rounded-controle object-cover" />
                      )}
                      <label className={`inline-flex h-12 items-center rounded-cartao px-4 text-base font-semibold ${travado ? "bg-zinc-200 text-texto-fraco dark:bg-zinc-800" : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"}`}>
                        {subindo === i.id ? "Enviando…" : r.foto_url ? "Trocar foto" : <span className="inline-flex items-center gap-1.5"><Icone nome="camera" tamanho={13} /> Tirar foto</span>}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={travado || subindo === i.id}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) mandarFoto(i.id, f); e.target.value = ""; }}
                          className="hidden"
                        />
                      </label>
                      {!r.foto_url && <span className="text-xs text-texto-fraco">foto obrigatória</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
            })}
          </div>
        ))}
      </div>

      {!concluida && (
        <div className="sticky bottom-3 mt-4">
          <button
            onClick={concluir}
            disabled={proc || faltamObrig.length > 0 || !execucaoId}
            className="h-14 w-full rounded-cartao bg-texto text-lg font-bold text-fundo disabled:opacity-40"
          >
            {proc ? "Concluindo…" : faltamObrig.length > 0 ? `Faltam ${faltamObrig.length} obrigatório(s)` : `Concluir (${itensOk.length}/${lista.itens.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
